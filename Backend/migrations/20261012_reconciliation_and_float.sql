CREATE TABLE IF NOT EXISTS "JobLease" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "owner" TEXT NOT NULL,
  "lockedUntil" TIMESTAMPTZ NOT NULL,
  "lastBalanceCheckAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "BillPurchase_status_updatedAt_idx"
  ON "BillPurchase" ("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "BillPurchase_userId_status_createdAt_idx"
  ON "BillPurchase" ("userId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "BillPurchase_userId_customerRef_createdAt_idx"
  ON "BillPurchase" ("userId", "customerRef", "createdAt");
CREATE INDEX IF NOT EXISTS "paymentIntent_status_createdAt_idx"
  ON "paymentIntent" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Withdrawal_status_createdAt_idx"
  ON "Withdrawal" ("status", "createdAt");
