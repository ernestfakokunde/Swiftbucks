import "dotenv/config";
import { db } from "../src/prisma/db.js";

type Source = "owner" | "paystack";
const args = new Map(process.argv.slice(2).map((arg) => {
  const separator = arg.indexOf("=");
  return separator < 0 ? [arg, ""] : [arg.slice(0, separator), arg.slice(separator + 1)];
}));
const amountText = args.get("--amount-kobo");
const source = args.get("--source");
const reference = args.get("--reference");
const amount = Number(amountText);

if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 10_000_000_000) {
  throw new Error("--amount-kobo must be a positive safe integer no greater than 10000000000");
}
if (source !== "owner" && source !== "paystack") throw new Error("--source must be owner or paystack");
if (!reference || !/^[A-Za-z0-9_-]{1,100}$/.test(reference)) {
  throw new Error("--reference must contain 1-100 letters, numbers, underscores or hyphens");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const sourceKind = source === "owner" ? "SYSTEM_OWNER_EQUITY" : "SYSTEM_PAYSTACK_HOLDING";
const transactionReference = `float_topup_${source}_${reference}`;
await db.connect();

try {
  const result = await db.transaction(async (tx) => {
    const prior = await tx.orm.public.Transaction.where({ reference: transactionReference }).first();
    const sourceAccount = await tx.orm.public.Account.where({ kind: sourceKind }).first();
    const floatAccount = await tx.orm.public.Account.where({ kind: "SYSTEM_VTPASS_FLOAT" }).first();
    if (!sourceAccount || !floatAccount) throw new Error("Float top-up system accounts are missing");

    if (prior) {
      const entries = await tx.orm.public.LedgerEntry.where({ transactionId: prior.id }).all();
      const matches = prior.type === "FLOAT_TOPUP" && prior.status === "COMPLETED" && entries.length === 2 &&
        entries.some((entry) => entry.accountId === sourceAccount.id && BigInt(entry.amountKobo) === BigInt(amount)) &&
        entries.some((entry) => entry.accountId === floatAccount.id && BigInt(entry.amountKobo) === -BigInt(amount));
      if (!matches) throw new Error("Top-up reference already exists with different details");
      return { duplicate: true, transactionId: prior.id };
    }

    const transaction = await tx.orm.public.Transaction.create({
      reference: transactionReference,
      type: "FLOAT_TOPUP",
      status: "COMPLETED",
    });
    await tx.orm.public.LedgerEntry.create({
      transactionId: transaction.id,
      accountId: sourceAccount.id,
      amountKobo: BigInt(amount),
    });
    await tx.orm.public.LedgerEntry.create({
      transactionId: transaction.id,
      accountId: floatAccount.id,
      amountKobo: -BigInt(amount),
    });
    return { duplicate: false, transactionId: transaction.id };
  });
  console.log(JSON.stringify({ ...result, source, amountKobo: amount }));
  process.exit(0);
} catch (error) {
  console.error("FLOAT_TOPUP_FAILED", error instanceof Error ? error.message : "top-up failed");
  process.exit(1);
}
