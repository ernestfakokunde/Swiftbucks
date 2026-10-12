import { randomUUID } from "node:crypto";
import { db } from "../prisma/db.js";
import { verifyTransaction } from "../lib/paystack.js";
import { verifyTransferByReference } from "../lib/paystack.js";
import { amountNairaToKobo } from "./dataPlans.service.js";
import { creditFromWebhook } from "./payment.service.js";
import { settleWithdrawal } from "./wallet.service.js";
import { reconcilePendingBills } from "./bills.service.js";

const LEASE_NAME = "financial-reconcile";
const LEASE_MS = 5 * 60_000;
const FLOAT_CHECK_MS = 10 * 60_000;

type BoolRow = { acquired: boolean };

function firstRow<T>(result: T | T[]): T | undefined {
  return Array.isArray(result) ? result[0] : result as T;
}

async function acquireLease(owner: string): Promise<boolean> {
  const expiresAt = new Date(Date.now() + LEASE_MS).toISOString();
  const result = await db.transaction((tx) => tx.query(db.raw.sql`
    WITH acquired AS (
      INSERT INTO "JobLease" ("name", "owner", "lockedUntil", "updatedAt")
      VALUES (${LEASE_NAME}, ${owner}, ${expiresAt}, now())
      ON CONFLICT ("name") DO UPDATE
        SET "owner" = EXCLUDED."owner", "lockedUntil" = EXCLUDED."lockedUntil", "updatedAt" = now()
        WHERE "JobLease"."lockedUntil" <= now()
      RETURNING "name"
    )
    SELECT EXISTS (SELECT 1 FROM acquired) AS acquired
  `.returnsRow({ acquired: "pg/bool@1" }).build()));
  return firstRow(result as BoolRow | BoolRow[])?.acquired === true;
}

async function renewLease(owner: string): Promise<boolean> {
  const expiresAt = new Date(Date.now() + LEASE_MS).toISOString();
  const result = await db.transaction((tx) => tx.query(db.raw.sql`
    WITH renewed AS (
      UPDATE "JobLease" SET "lockedUntil" = ${expiresAt}, "updatedAt" = now()
      WHERE "name" = ${LEASE_NAME} AND "owner" = ${owner} AND "lockedUntil" > now()
      RETURNING "name"
    )
    SELECT EXISTS (SELECT 1 FROM renewed) AS acquired
  `.returnsRow({ acquired: "pg/bool@1" }).build()));
  return firstRow(result as BoolRow | BoolRow[])?.acquired === true;
}

async function releaseLease(owner: string) {
  await db.orm.public.JobLease.where({ name: LEASE_NAME, owner }).update({
    lockedUntil: new Date().toISOString(),
  });
}

async function expireOldIntent(id: number) {
  await db.transaction(async (tx) => {
    await tx.query(db.raw.sql`SELECT id FROM "paymentIntent" WHERE id = ${id} FOR UPDATE`
      .returnsRow({ id: "pg/int4@1" }).build());
    const current = await tx.orm.public.paymentIntent.where({ id }).first();
    if (current?.status === "PENDING") {
      await tx.orm.public.paymentIntent.where({ id }).update({ status: "EXPIRED" });
    }
  });
}

async function reconcileDeposits(renew: () => Promise<boolean>) {
  const intents = await db.orm.public.paymentIntent.where({ status: "PENDING" }).all();
  const now = Date.now();
  let checked = 0;
  let expired = 0;
  for (const intent of intents) {
    const age = now - new Date(intent.createdAt).getTime();
    if (age >= 72 * 60 * 60_000) {
      if (!await renew()) break;
      await expireOldIntent(intent.id);
      expired += 1;
      continue;
    }
    if (age < 5 * 60_000) continue;
    if (!await renew()) break;
    try {
      const verified = await verifyTransaction(intent.reference);
      checked += 1;
      if (verified.status === "success") {
        await creditFromWebhook({
          event: "charge.success",
          data: {
            reference: verified.reference,
            amount: verified.amount,
            currency: verified.currency,
            fees: verified.fees,
          },
        }, { attempted: true, feeKobo: verified.fees });
      }
    } catch (error) {
      console.error("DEPOSIT_RECONCILE_UNKNOWN", intent.reference, error instanceof Error ? error.message : "verification failed");
    }
  }
  return { candidates: intents.length, checked, expired };
}

async function reconcileWithdrawals(renew: () => Promise<boolean>) {
  const withdrawals = await db.orm.public.Withdrawal.where({ status: "PENDING" }).all();
  const now = Date.now();
  let checked = 0;
  for (const withdrawal of withdrawals) {
    const age = now - new Date(withdrawal.createdAt).getTime();
    if (age < 10 * 60_000) continue;
    if (!await renew()) break;
    try {
      const transfer = await verifyTransferByReference(withdrawal.reference);
      checked += 1;
      const status = transfer.status.toLowerCase();
      if (status === "success" || status === "failed" || status === "reversed") {
        await settleWithdrawal({
          reference: withdrawal.reference,
          status: status === "success" ? "SUCCESS" : status === "reversed" ? "REVERSED" : "FAILED",
          amountKobo: transfer.amount,
          currency: transfer.currency,
          costKobo: transfer.fees,
        });
      } else if (age >= 24 * 60 * 60_000) {
        console.error("RECONCILE_ALERT", JSON.stringify({ pendingWithdrawals: 1, unknownProviderOutcome: 1 }));
      }
    } catch (error) {
      if (age >= 24 * 60 * 60_000) {
        console.error("RECONCILE_ALERT", JSON.stringify({ pendingWithdrawals: 1, verificationErrors: 1 }));
      }
      console.error("WITHDRAWAL_RECONCILE_UNKNOWN", withdrawal.reference, error instanceof Error ? error.message : "verification failed");
    }
  }
  return { candidates: withdrawals.length, checked };
}

async function ledgerIntegrityCounts() {
  const row = await db.transaction(async (tx) => {
    await tx.query(db.raw.sql`SET TRANSACTION READ ONLY`.affectedCount().build());
    return tx.query(db.raw.sql`
      SELECT jsonb_build_object(
        'unbalancedTransactions', (SELECT COUNT(*) FROM (SELECT t.id FROM "Transaction" t LEFT JOIN "LedgerEntry" e ON e."transactionId"=t.id GROUP BY t.id HAVING COALESCE(SUM(e."amountKobo"),0)<>0) q),
        'wholeLedgerNonzero', (SELECT CASE WHEN COALESCE(SUM("amountKobo"),0)=0 THEN 0 ELSE 1 END FROM "LedgerEntry"),
        'negativeWallets', (SELECT COUNT(*) FROM (SELECT a.id FROM "Account" a LEFT JOIN "LedgerEntry" e ON e."accountId"=a.id WHERE a.kind='USER_WALLET' GROUP BY a.id HAVING COALESCE(SUM(e."amountKobo"),0)<0) q),
        'transactionsWithoutEntries', (SELECT COUNT(*) FROM "Transaction" t WHERE NOT EXISTS (SELECT 1 FROM "LedgerEntry" e WHERE e."transactionId"=t.id)),
        'successfulIntentsWithoutDeposit', (SELECT COUNT(*) FROM "paymentIntent" p WHERE p.status='SUCCESS' AND NOT EXISTS (SELECT 1 FROM "Transaction" t WHERE t.reference=p.reference AND t.type='DEPOSIT')),
        'depositsWithoutSuccessfulIntent', (SELECT COUNT(*) FROM "Transaction" t WHERE t.type='DEPOSIT' AND NOT EXISTS (SELECT 1 FROM "paymentIntent" p WHERE p.reference=t.reference AND p.status='SUCCESS')),
        'deliveredWithoutSettlement', (SELECT COUNT(*) FROM "BillPurchase" b WHERE b.status='DELIVERED' AND NOT EXISTS (SELECT 1 FROM "Transaction" t WHERE t.reference=b."providerRequestId"||'_settle')),
        'failedOrReversedWithoutReversal', (SELECT COUNT(*) FROM "BillPurchase" b WHERE b.status IN ('FAILED','REVERSED') AND NOT EXISTS (SELECT 1 FROM "Transaction" t WHERE t.reference=b."providerRequestId"||'_reversal')),
        'pendingBillsMismatch', (SELECT CASE WHEN
          COALESCE((SELECT SUM(e."amountKobo") FROM "LedgerEntry" e JOIN "Account" a ON a.id=e."accountId" WHERE a.kind='SYSTEM_BILLS_PENDING'),0)=
          COALESCE((SELECT SUM("amountKobo") FROM "BillPurchase" WHERE status IN ('RESERVED','PROCESSING')),0)
          THEN 0 ELSE 1 END),
        'platformFeeSnapshotMismatch', (SELECT CASE WHEN
          COALESCE((SELECT SUM(e."amountKobo") FROM "LedgerEntry" e JOIN "Account" a ON a.id=e."accountId" WHERE a.kind='SYSTEM_PLATFORM_FEES'),0)=
          COALESCE((SELECT SUM("feeKobo") FROM "paymentIntent" WHERE status='SUCCESS'),0)+
          COALESCE((SELECT SUM("feeKobo") FROM "Withdrawal" WHERE status IN ('PENDING','SUCCESS')),0)
          THEN 0 ELSE 1 END)
      )::text AS result
    `.returnsRow({ result: "pg/text@1" }).build());
  });
  const result = firstRow(row as { result: string } | Array<{ result: string }>);
  if (!result) throw new Error("Could not read ledger integrity metrics");
  const counts = JSON.parse(result.result) as Record<string, number>;
  if (Object.values(counts).some((count) => count !== 0)) {
    console.error("RECONCILE_ALERT", JSON.stringify(counts));
  }
  return counts;
}

async function checkVtpassFloat() {
  const lease = await db.orm.public.JobLease.where({ name: LEASE_NAME }).first();
  const lastCheck = lease?.lastBalanceCheckAt ? new Date(lease.lastBalanceCheckAt).getTime() : 0;
  if (Date.now() - lastCheck < FLOAT_CHECK_MS) return { checked: false };
  await db.orm.public.JobLease.where({ name: LEASE_NAME }).update({ lastBalanceCheckAt: new Date().toISOString() });

  try {
    const balanceResponse = await (await import("../lib/vtpass.js")).vtpassProvider.balance();
    const root = balanceResponse && typeof balanceResponse === "object"
      ? balanceResponse as { contents?: { balance?: unknown }; balance?: unknown }
      : {};
    const providerBalanceKobo = amountNairaToKobo(root.contents?.balance ?? root.balance);
    if (providerBalanceKobo === null) throw new Error("VTpass returned an unreadable balance");
    const account = await db.orm.public.Account.where({ kind: "SYSTEM_VTPASS_FLOAT" }).first();
    if (!account) throw new Error("SYSTEM_VTPASS_FLOAT account is missing");
    const entries = await db.orm.public.LedgerEntry.where({ accountId: account.id }).all();
    const ledgerAvailableKobo = -entries.reduce((sum, entry) => sum + BigInt(entry.amountKobo), 0n);
    const tolerance = BigInt(process.env.BILLS_FLOAT_TOLERANCE_KOBO ?? 100);
    const difference = ledgerAvailableKobo - BigInt(providerBalanceKobo);
    if ((difference < 0n ? -difference : difference) > tolerance) {
      console.error("BILLS_FLOAT_MISMATCH", JSON.stringify({
        ledgerAvailableKobo: ledgerAvailableKobo.toString(),
        providerBalanceKobo,
        differenceKobo: difference.toString(),
      }));
    }
    if (providerBalanceKobo < Number(process.env.BILLS_FLOAT_MIN_KOBO ?? 100_000)) {
      console.error("BILLS_FLOAT_LOW", providerBalanceKobo);
    }
    return { checked: true, providerBalanceKobo };
  } catch (error) {
    console.error("BILLS_FLOAT_BALANCE_FAILED", error instanceof Error ? error.message : "provider error");
    return { checked: true, failed: true };
  }
}

export async function reconcileFinancialFlows() {
  const owner = randomUUID();
  if (!await acquireLease(owner)) return { acquired: false };
  const renew = () => renewLease(owner);
  try {
    const bills = await reconcilePendingBills(renew);
    const deposits = await reconcileDeposits(renew);
    const withdrawals = await reconcileWithdrawals(renew);
    if (!await renew()) return { acquired: true, leaseLost: true, bills, deposits, withdrawals };
    const integrity = await ledgerIntegrityCounts();
    const float = await checkVtpassFloat();
    return { acquired: true, bills, deposits, withdrawals, integrity, float };
  } finally {
    await releaseLease(owner);
  }
}
