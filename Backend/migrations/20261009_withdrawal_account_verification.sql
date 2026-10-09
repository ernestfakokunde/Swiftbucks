ALTER TABLE "Withdrawal"
  ADD COLUMN IF NOT EXISTS "bankName" TEXT,
  ADD COLUMN IF NOT EXISTS "accountLast4" TEXT,
  ADD COLUMN IF NOT EXISTS "accountName" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

ALTER TABLE "Withdrawal"
  ALTER COLUMN "accountNumber" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Withdrawal_userId_idempotencyKey_key"
  ON "Withdrawal" ("userId", "idempotencyKey");

-- Legacy accountNumber is intentionally retained for existing rows.
-- Drop it only in a later migration after all historical data is migrated.
