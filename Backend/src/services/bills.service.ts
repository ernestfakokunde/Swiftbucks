import { db } from "../prisma/db.js";
import { AppError } from "../lib/errors.js";
import {
  classifyVtpassResponse,
  generateProviderRequestId,
  purchaseAirtime as callProvider,
  getVtpassBalance,
  requeryVtpass,
  vtpassResponseDetails,
  type BillOutcome,
} from "../lib/vtpass.js";

export const AIRTIME_NETWORKS = [
  { id: "mtn", name: "MTN" },
  { id: "glo", name: "Glo" },
  { id: "airtel", name: "Airtel" },
  { id: "etisalat", name: "9mobile" },
] as const;

const minAmount = () => Number(process.env.BILLS_AIRTIME_MIN_KOBO ?? 5_000);
const maxAmount = () => Number(process.env.BILLS_AIRTIME_MAX_KOBO ?? 1_000_000);
const dailyCap = () => BigInt(process.env.BILLS_DAILY_CAP_KOBO ?? 5_000_000);

function maskPhone(phone: string) { return `${phone.slice(0, 4)}***${phone.slice(-3)}`; }
function statusForClient(status: string) { return status === "RESERVED" || status === "PROCESSING" ? "PENDING" : status; }

export function serializePurchase(purchase: {
  id: number; providerRequestId: string; category: string; serviceId: string; customerRef: string;
  amountKobo: bigint; providerCostKobo: bigint | null; commissionKobo: bigint | null; status: string;
  failureReason: string | null; providerTxId: string | null; createdAt: string;
}) {
  return {
    id: purchase.id, reference: purchase.providerRequestId, category: purchase.category,
    network: purchase.serviceId, phone: maskPhone(purchase.customerRef),
    amountKobo: purchase.amountKobo.toString(),
    providerCostKobo: purchase.providerCostKobo?.toString() ?? null,
    commissionKobo: purchase.commissionKobo?.toString() ?? null,
    status: statusForClient(purchase.status), failureReason: purchase.failureReason,
    providerTxId: purchase.providerTxId, createdAt: purchase.createdAt,
  };
}

async function reserve(userId: number, input: { idempotencyKey: string; network: string; phone: string; amountKobo: number }) {
  const existing = await db.orm.public.BillPurchase.where({ userId, idempotencyKey: input.idempotencyKey }).first();
  if (existing) {
    if (existing.serviceId !== input.network || existing.customerRef !== input.phone || BigInt(existing.amountKobo) !== BigInt(input.amountKobo)) {
      throw new AppError(409, "Idempotency key reused with different details");
    }
    return { purchase: existing, duplicate: true };
  }
  const recent = await db.orm.public.BillPurchase.where({ userId }).all();
  if (recent.some((item) => item.serviceId === input.network && item.customerRef === input.phone && Date.now() - new Date(item.createdAt).getTime() < 60_000 && item.idempotencyKey !== input.idempotencyKey)) {
    throw new AppError(409, "Please wait a minute before buying again for this number.");
  }
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const totalToday = recent.filter((item) => new Date(item.createdAt) >= start && item.status !== "REVERSED" && item.status !== "FAILED")
    .reduce((sum, item) => sum + BigInt(item.amountKobo), 0n);
  if (totalToday + BigInt(input.amountKobo) > dailyCap()) throw new AppError(400, "Daily airtime limit reached");

  try {
    return await db.transaction(async (tx) => {
      await tx.query(db.raw.sql`SELECT id FROM "Account" WHERE "userId" = ${userId} AND kind = 'USER_WALLET' FOR UPDATE`
        .returnsRow({ id: "pg/int4@1" }).build());
      const wallet = await tx.orm.public.Account.where({ userId, kind: "USER_WALLET" }).first();
      const pending = await tx.orm.public.Account.where({ kind: "SYSTEM_BILLS_PENDING" }).first();
      if (!wallet || !pending) throw new Error("Bill payment system accounts are missing");
      const entries = await tx.orm.public.LedgerEntry.where({ accountId: wallet.id }).all();
      const balance = entries.reduce((sum, entry) => sum + BigInt(entry.amountKobo), 0n);
      if (balance < BigInt(input.amountKobo)) throw new AppError(400, "Insufficient funds");
      const reference = generateProviderRequestId();
      const transaction = await tx.orm.public.Transaction.create({ reference, type: "BILL_PAYMENT", status: "PENDING" });
      await tx.orm.public.LedgerEntry.create({ transactionId: transaction.id, accountId: wallet.id, amountKobo: -BigInt(input.amountKobo) });
      await tx.orm.public.LedgerEntry.create({ transactionId: transaction.id, accountId: pending.id, amountKobo: BigInt(input.amountKobo) });
      const purchase = await tx.orm.public.BillPurchase.create({
        userId, idempotencyKey: input.idempotencyKey, providerRequestId: reference, category: "AIRTIME",
        serviceId: input.network, customerRef: input.phone, amountKobo: BigInt(input.amountKobo),
        transactionId: transaction.id, status: "RESERVED",
      });
      return { purchase, duplicate: false };
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505") {
      const duplicate = await db.orm.public.BillPurchase.where({ userId, idempotencyKey: input.idempotencyKey }).first();
      if (duplicate) return { purchase: duplicate, duplicate: true };
    }
    throw error;
  }
}

async function updateProcessing(id: number) {
  await db.orm.public.BillPurchase.where({ id }).update({ status: "PROCESSING" });
}

export async function settlePurchase(id: number, details: ReturnType<typeof vtpassResponseDetails>) {
  return db.transaction(async (tx) => {
    await tx.query(db.raw.sql`SELECT id FROM "BillPurchase" WHERE id = ${id} FOR UPDATE`.returnsRow({ id: "pg/int4@1" }).build());
    const purchase = await tx.orm.public.BillPurchase.where({ id }).first();
    if (!purchase || purchase.status === "DELIVERED") return purchase;
    const pending = await tx.orm.public.Account.where({ kind: "SYSTEM_BILLS_PENDING" }).first();
    const float = await tx.orm.public.Account.where({ kind: "SYSTEM_VTPASS_FLOAT" }).first();
    const revenue = await tx.orm.public.Account.where({ kind: "SYSTEM_BILLS_REVENUE" }).first();
    if (!pending || !float || !revenue) throw new Error("Bill settlement accounts are missing");
    const cost = details.total === undefined ? BigInt(purchase.amountKobo) : BigInt(Math.round(details.total * 100));
    if (details.total === undefined) console.warn("BILL_COST_ESTIMATED", purchase.providerRequestId);
    const charge = BigInt(purchase.amountKobo);
    const margin = charge - cost;
    if (margin < 0n) console.error("BILL_NEGATIVE_MARGIN", purchase.providerRequestId);
    const settlementReference = `${purchase.providerRequestId}_settle`;
    if (!await tx.orm.public.Transaction.where({ reference: settlementReference }).first()) {
      const transaction = await tx.orm.public.Transaction.create({ reference: settlementReference, type: "BILL_PAYMENT_SETTLEMENT", status: "COMPLETED" });
      for (const [accountId, amountKobo] of [[pending.id, -charge], [float.id, cost], [revenue.id, margin]] as const) {
        await tx.orm.public.LedgerEntry.create({ transactionId: transaction.id, accountId, amountKobo });
      }
    }
    await tx.orm.public.Transaction.where({ id: purchase.transactionId }).update({ status: "COMPLETED" });
    return tx.orm.public.BillPurchase.where({ id }).update({
      status: "DELIVERED", providerCostKobo: cost,
      commissionKobo: details.commission === undefined ? null : BigInt(Math.round(details.commission * 100)),
      providerTxId: details.transactionId ?? null,
    });
  });
}

export async function reversePurchase(id: number, reason: string) {
  return db.transaction(async (tx) => {
    await tx.query(db.raw.sql`SELECT id FROM "BillPurchase" WHERE id = ${id} FOR UPDATE`.returnsRow({ id: "pg/int4@1" }).build());
    const purchase = await tx.orm.public.BillPurchase.where({ id }).first();
    if (!purchase || purchase.status === "REVERSED" || purchase.status === "FAILED") return purchase;
    const wallet = await tx.orm.public.Account.where({ userId: purchase.userId, kind: "USER_WALLET" }).first();
    const pending = await tx.orm.public.Account.where({ kind: "SYSTEM_BILLS_PENDING" }).first();
    if (!wallet || !pending) throw new Error("Bill reversal accounts are missing");
    const reference = `${purchase.providerRequestId}_reversal`;
    if (!await tx.orm.public.Transaction.where({ reference }).first()) {
      const transaction = await tx.orm.public.Transaction.create({ reference, type: "BILL_PAYMENT_REVERSAL", status: "COMPLETED" });
      await tx.orm.public.LedgerEntry.create({ transactionId: transaction.id, accountId: wallet.id, amountKobo: BigInt(purchase.amountKobo) });
      await tx.orm.public.LedgerEntry.create({ transactionId: transaction.id, accountId: pending.id, amountKobo: -BigInt(purchase.amountKobo) });
    }
    if (purchase.status === "DELIVERED") {
      console.error("BILL_REVERSED_AFTER_DELIVERY", purchase.providerRequestId);
      const settlement = await tx.orm.public.Transaction.where({ reference: `${purchase.providerRequestId}_settle` }).first();
      const float = await tx.orm.public.Account.where({ kind: "SYSTEM_VTPASS_FLOAT" }).first();
      const revenue = await tx.orm.public.Account.where({ kind: "SYSTEM_BILLS_REVENUE" }).first();
      const settlementReversal = await tx.orm.public.Transaction.where({ reference: `${purchase.providerRequestId}_settle_reversal` }).first();
      if (settlement && float && revenue && !settlementReversal) {
        const cost = purchase.providerCostKobo ?? purchase.amountKobo;
        const margin = BigInt(purchase.amountKobo) - BigInt(cost);
        const reversal = await tx.orm.public.Transaction.create({ reference: `${purchase.providerRequestId}_settle_reversal`, type: "BILL_PAYMENT_REVERSAL", status: "COMPLETED" });
        await tx.orm.public.LedgerEntry.create({ transactionId: reversal.id, accountId: pending.id, amountKobo: BigInt(purchase.amountKobo) });
        await tx.orm.public.LedgerEntry.create({ transactionId: reversal.id, accountId: float.id, amountKobo: -BigInt(cost) });
        await tx.orm.public.LedgerEntry.create({ transactionId: reversal.id, accountId: revenue.id, amountKobo: -margin });
      }
    }
    await tx.orm.public.Transaction.where({ id: purchase.transactionId }).update({ status: "REVERSED" });
    return tx.orm.public.BillPurchase.where({ id }).update({ status: "REVERSED", failureReason: reason });
  });
}

async function applyOutcome(id: number, body: unknown): Promise<BillOutcome> {
  const details = vtpassResponseDetails(body);
  const outcome = classifyVtpassResponse(details.code, details.status);
  if (["018", "023", "027", "028", "087"].includes(details.code ?? "")) console.error("BILLS_CONFIG_ALERT", details.code);
  if (outcome === "DELIVERED") await settlePurchase(id, details);
  else if (outcome === "FAILED" || outcome === "REVERSED") await reversePurchase(id, details.status ?? details.code ?? "Provider failure");
  return outcome;
}

export async function purchaseBill(userId: number, input: { idempotencyKey: string; network: string; phone: string; amountKobo: number }) {
  const reserved = await reserve(userId, input);
  if (reserved.duplicate) return { purchase: serializePurchase(reserved.purchase), statusCode: 200 };
  await updateProcessing(reserved.purchase.id);
  let body: unknown;
  try {
    body = await callProvider({ requestId: reserved.purchase.providerRequestId, serviceId: input.network, amountNaira: input.amountKobo / 100, phone: input.phone });
  } catch (error) {
    console.error("BILL_OUTCOME_UNKNOWN", reserved.purchase.providerRequestId, error instanceof Error ? error.message : "provider error");
    return { purchase: serializePurchase(await db.orm.public.BillPurchase.where({ id: reserved.purchase.id }).first() ?? reserved.purchase), statusCode: 202 };
  }
  const outcome = await applyOutcome(reserved.purchase.id, body);
  const fresh = await db.orm.public.BillPurchase.where({ id: reserved.purchase.id }).first();
  return { purchase: serializePurchase(fresh ?? reserved.purchase), statusCode: outcome === "PENDING" ? 202 : 201 };
}

export async function requeryPurchase(id: number) {
  const purchase = await db.orm.public.BillPurchase.where({ id }).first();
  if (!purchase) return null;
  try {
    const response = await requeryVtpass(purchase.providerRequestId);
    const details = vtpassResponseDetails(response);
    if (details.code === "015" && purchase.failureReason !== "RETRY_SENT") {
      await db.orm.public.BillPurchase.where({ id }).update({ failureReason: "RETRY_SENT" });
      return await applyOutcome(id, await callProvider({
        requestId: purchase.providerRequestId,
        serviceId: purchase.serviceId,
        amountNaira: Number(purchase.amountKobo) / 100,
        phone: purchase.customerRef,
      }));
    }
    return await applyOutcome(id, response);
  }
  catch (error) { console.error("BILL_OUTCOME_UNKNOWN", purchase.providerRequestId, error instanceof Error ? error.message : "requery error"); return "PENDING"; }
}

export async function reconcileBills() {
  const purchases = await db.orm.public.BillPurchase.all();
  const now = Date.now();
  for (const purchase of purchases) {
    const age = now - new Date(purchase.updatedAt).getTime();
    if ((purchase.status === "PROCESSING" && age > 120_000) || (purchase.status === "RESERVED" && age > 60_000)) {
      await requeryPurchase(purchase.id);
    }
    if ((purchase.status === "PROCESSING" || purchase.status === "RESERVED") && age > 86_400_000) {
      console.error("RECONCILE_ALERT", purchase.providerRequestId);
    }
  }
  try {
    const balance = await getVtpassBalance();
    const root = balance && typeof balance === "object" ? balance as { contents?: { balance?: number }; balance?: number } : {};
    const kobo = Math.round((root.contents?.balance ?? root.balance ?? 0) * 100);
    if (kobo < Number(process.env.BILLS_FLOAT_MIN_KOBO ?? 100_000)) console.error("BILLS_FLOAT_LOW", kobo);
  } catch (error) {
    console.error("BILLS_FLOAT_BALANCE_FAILED", error instanceof Error ? error.message : "provider error");
  }
}

export async function getUserPurchases(userId: number) {
  const purchases = await db.orm.public.BillPurchase.where({ userId }).all();
  return purchases.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20).map(serializePurchase);
}

export async function getUserPurchase(userId: number, id: number) {
  const purchase = await db.orm.public.BillPurchase.where({ id }).first();
  if (!purchase || purchase.userId !== userId) throw new AppError(404, "Purchase not found");
  return serializePurchase(purchase);
}
