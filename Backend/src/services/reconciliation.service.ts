import { db } from "../prisma/db.js";

async function accountBalance(accountId: number): Promise<bigint> {
  const entries = await db.orm.public.LedgerEntry.where({ accountId }).all();
  return entries.reduce((sum, entry) => sum + BigInt(entry.amountKobo), 0n);
}

export async function reconcileFinancials() {
  const platform = await db.orm.public.Account.where({ kind: "SYSTEM_PLATFORM_FEES" }).first();
  const paystack = await db.orm.public.Account.where({ kind: "SYSTEM_PAYSTACK_FEES" }).first();
  const payout = await db.orm.public.Account.where({ kind: "SYSTEM_PAYOUT_HOLDING" }).first();
  if (!platform || !paystack || !payout) {
    throw new Error("Reconciliation system accounts are missing");
  }

  const platformEntries = await db.orm.public.LedgerEntry.where({ accountId: platform.id }).all();
  const paystackEntries = await db.orm.public.LedgerEntry.where({ accountId: paystack.id }).all();
  let depositPlatformFees = 0n;
  let platformFees = 0n;
  for (const entry of platformEntries) {
    const transaction = await db.orm.public.Transaction.where({ id: entry.transactionId }).first();
    const amount = BigInt(entry.amountKobo);
    platformFees += amount;
    if (transaction?.type === "DEPOSIT") depositPlatformFees += amount;
  }
  const paystackFees = -paystackEntries.reduce((sum, entry) => sum + BigInt(entry.amountKobo), 0n);
  const intents = await db.orm.public.paymentIntent.where({ status: "SUCCESS" }).all();
  const storedDepositFees = intents.reduce((sum, intent) => sum + BigInt(intent.feeKobo), 0n);
  const pending = await db.orm.public.Withdrawal.where({ status: "PENDING" }).all();
  const pendingWithdrawals = pending.reduce((sum, withdrawal) => sum + BigInt(withdrawal.amountKobo), 0n);
  const transactions = await db.orm.public.Transaction.all();
  const unbalancedTransactions: number[] = [];
  for (const transaction of transactions) {
    const entries = await db.orm.public.LedgerEntry.where({ transactionId: transaction.id }).all();
    if (entries.reduce((sum, entry) => sum + BigInt(entry.amountKobo), 0n) !== 0n) {
      unbalancedTransactions.push(transaction.id);
    }
  }

  return {
    platformFees,
    depositPlatformFees,
    paystackFees,
    grossMargin: platformFees - paystackFees,
    storedDepositFees,
    platformFeesMatchDeposits: depositPlatformFees === storedDepositFees,
    payoutHoldingBalance: await accountBalance(payout.id),
    pendingWithdrawals,
    payoutHoldingMatchesPending: (await accountBalance(payout.id)) === -pendingWithdrawals,
    unbalancedTransactions,
    ledgerBalanced: unbalancedTransactions.length === 0,
  };
}
