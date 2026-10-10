import { db } from "../prisma/db.js";

const SYSTEM_ACCOUNT_KINDS = [
  "SYSTEM_PAYSTACK_HOLDING",
  "SYSTEM_PAYSTACK_FEES",
  "SYSTEM_PLATFORM_FEES",
  "SYSTEM_PAYOUT_HOLDING",
  "SYSTEM_BILLS_PENDING",
  "SYSTEM_VTPASS_FLOAT",
  "SYSTEM_BILLS_REVENUE",
] as const;

export async function seedSystemAccounts() {
  for (const kind of SYSTEM_ACCOUNT_KINDS) {
    const accounts = await db.orm.public.Account.where({ kind }).all();
    const duplicates = accounts.filter((account) => account.userId === null);
    if (duplicates.length > 1) {
      console.error("DUPLICATE_SYSTEM_ACCOUNTS", kind, duplicates.map((account) => account.id));
    }
  }

  try {
    await db.transaction(async (tx) => {
      await tx.query(
        db.raw.sql`CREATE UNIQUE INDEX IF NOT EXISTS "Account_system_kind_unique"
          ON "Account" ("kind") WHERE "userId" IS NULL`
          .affectedCount()
          .build(),
      );
    });
  } catch (error) {
    console.error("SYSTEM_ACCOUNT_UNIQUE_INDEX_FAILED", error);
    return;
  }

  for (const kind of SYSTEM_ACCOUNT_KINDS) {
    const existing = await db.orm.public.Account.where({ kind }).first();
    if (!existing) {
      await db.orm.public.Account.create({ kind, currency: "NGN" });
    }
  }
}
