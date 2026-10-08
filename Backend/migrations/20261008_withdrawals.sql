CREATE TABLE IF NOT EXISTS "Withdrawal" (
  "id" SERIAL PRIMARY KEY,
  "reference" TEXT NOT NULL UNIQUE,
  "transactionId" INTEGER NOT NULL UNIQUE REFERENCES "Transaction"("id"),
  "userId" INTEGER NOT NULL REFERENCES "User"("id"),
  "amountKobo" BIGINT NOT NULL CHECK ("amountKobo" > 0),
  "bankCode" TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "recipientCode" TEXT,
  "transferCode" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "Withdrawal_userId_idx" ON "Withdrawal" ("userId");
CREATE INDEX IF NOT EXISTS "Withdrawal_transferCode_idx" ON "Withdrawal" ("transferCode");

CREATE OR REPLACE FUNCTION swiftbucks_check_transaction_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT COALESCE(SUM("amountKobo"), 0) FROM "LedgerEntry"
      WHERE "transactionId" = NEW."transactionId") <> 0 THEN
    RAISE EXCEPTION 'Ledger transaction must balance to zero';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ledger_transaction_balance ON "LedgerEntry";
CREATE CONSTRAINT TRIGGER ledger_transaction_balance
AFTER INSERT OR UPDATE ON "LedgerEntry"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION swiftbucks_check_transaction_balance();
