CREATE TABLE IF NOT EXISTS "BillPurchase" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"("id"),
  "idempotencyKey" TEXT NOT NULL,
  "providerRequestId" TEXT NOT NULL UNIQUE,
  "category" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "customerRef" TEXT NOT NULL,
  "amountKobo" BIGINT NOT NULL,
  "providerCostKobo" BIGINT,
  "commissionKobo" BIGINT,
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "failureReason" TEXT,
  "providerTxId" TEXT,
  "transactionId" INTEGER NOT NULL UNIQUE REFERENCES "Transaction"("id"),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "BillPurchase_userId_idempotencyKey_key" UNIQUE ("userId", "idempotencyKey")
);
CREATE INDEX IF NOT EXISTS "BillPurchase_userId_idx" ON "BillPurchase" ("userId");
