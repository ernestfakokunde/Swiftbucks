import { randomBytes } from "node:crypto";
import { db } from "../prisma/db.js";
import { initializePayment } from "../lib/paystack.js";
import { verifyTransaction } from "../lib/paystack.js";
import { AppError } from "../lib/errors.js";
import { creditKobo, totalDepositFeeKobo } from "../lib/fees.js";

export function depositQuote(amountKobo: number) {
  const feeKobo = totalDepositFeeKobo(amountKobo);
  const credit = creditKobo(amountKobo);
  if (credit < 100) throw new AppError(400, "Amount too small");
  return { amountKobo, feeKobo, creditKobo: credit };
}

export async function startDeposit(userId: number, amountKobo: number) {
  const user = await db.orm.public.User.where({ id: userId }).first();
  if (!user) throw new AppError(401, "Not logged in");
  const quote = depositQuote(amountKobo);

  const reference = `dep_${randomBytes(12).toString("hex")}`;

  await db.orm.public.paymentIntent.create({
    reference,
    userId,
    amountKobo: BigInt(amountKobo),
    feeKobo: BigInt(quote.feeKobo),
  });

  try {
    const data = await initializePayment({
      email: user.email,
      amountKobo,
      reference,
      callbackUrl: `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/add-money/done`,
    });
    return { authorizationUrl: data.authorization_url, reference, ...quote };
  } catch (err) {
    console.error("Paystack initialize failed:", err);
    throw new AppError(502, "Could not start the payment. Try again.");
  }
}

export async function depositStatus(userId: number, reference: string) {
  const intent = await db.orm.public.paymentIntent.where({ reference }).first();
  if (!intent || intent.userId !== userId) {
    throw new AppError(404, "Payment not found");
  }
  if (intent.status === "PENDING") {
    try {
      const payment = await verifyTransaction(reference);
      if (payment.status === "success") {
        await creditFromWebhook({
          event: "charge.success",
          data: {
            reference: payment.reference,
            amount: payment.amount,
            currency: payment.currency,
            fees: payment.fees,
          },
        });
      }
    } catch (error) {
      console.error("Paystack verification failed:", error);
    }
  }
  const current = await db.orm.public.paymentIntent.where({ reference }).first();
  return {
    status: current?.status ?? intent.status,
    creditedKobo:
      current?.status === "SUCCESS"
        ? (BigInt(current.amountKobo) - BigInt(current.feeKobo)).toString()
        : undefined,
  };
}

export async function creditFromWebhook(event: {
  event: string;
  data: {
    reference: string;
    amount: number;
    currency: string;
    fees?: number | undefined;
  };
}) {
  if (event.event !== "charge.success") return;

  const intent = await db.orm.public.paymentIntent.where({
    reference: event.data.reference,
  }).first();
  if (!intent) return;

  await db.transaction(async (tx) => {
    await tx.query(
      db.raw.sql`SELECT id FROM "paymentIntent" WHERE id = ${intent.id} FOR UPDATE`
        .returnsRow({ id: "pg/int4@1" })
        .build(),
    );

    const fresh = await tx.orm.public.paymentIntent.where({ id: intent.id }).first();
    if (!fresh || fresh.status !== "PENDING") return;

    if (
      event.data.currency !== "NGN" ||
      BigInt(event.data.amount) !== BigInt(fresh.amountKobo)
    ) {
      await tx.orm.public.paymentIntent.where({ id: fresh.id }).update({
        status: "MISMATCH",
      });
      console.error("Deposit amount or currency mismatch for", fresh.reference);
      return;
    }
    const actualFee = event.data.fees ?? 0;
    if (event.data.fees === undefined) {
      console.warn("DEPOSIT_FEE_MISSING", fresh.reference);
    }
    if (!Number.isSafeInteger(actualFee) || actualFee < 0 || actualFee > event.data.amount) {
      await tx.orm.public.paymentIntent.where({ id: fresh.id }).update({
        status: "MISMATCH",
      });
      console.error("Deposit fee mismatch for", fresh.reference);
      return;
    }

    const wallet = await tx.orm.public.Account.where({
      userId: fresh.userId,
      kind: "USER_WALLET",
    }).first();
    if (!wallet) throw new Error("Wallet missing for intent " + fresh.reference);

    const holding = await tx.orm.public.Account.where({
      kind: "SYSTEM_PAYSTACK_HOLDING",
    }).first();
    if (!holding) throw new Error("SYSTEM_PAYSTACK_HOLDING account is missing");
    const fees = await tx.orm.public.Account.where({
      kind: "SYSTEM_PAYSTACK_FEES",
    }).first();
    if (!fees) throw new Error("SYSTEM_PAYSTACK_FEES account is missing");
    const platformFees = await tx.orm.public.Account.where({
      kind: "SYSTEM_PLATFORM_FEES",
    }).first();
    if (!platformFees) throw new Error("SYSTEM_PLATFORM_FEES account is missing");

    const amount = BigInt(event.data.amount);
    const paystackFee = BigInt(actualFee);
    const platformFee = BigInt(fresh.feeKobo);
    const entries: bigint[] = [
      -(amount - paystackFee),
      -paystackFee,
      amount - platformFee,
      platformFee,
    ];
    if (entries.reduce((sum, value) => sum + value, 0n) !== 0n) {
      throw new Error(`Deposit ledger does not balance for ${fresh.reference}`);
    }
    if (actualFee > Number(fresh.feeKobo)) {
      console.error("DEPOSIT_FEE_BELOW_COST", fresh.reference, event.data.amount, Number(fresh.feeKobo), actualFee);
    }

    const transaction = await tx.orm.public.Transaction.create({
      reference: fresh.reference,
      type: "DEPOSIT",
      status: "COMPLETED",
    });

    await tx.orm.public.LedgerEntry.create({
      transactionId: transaction.id,
      accountId: holding.id,
      amountKobo: entries[0]!,
    });
    await tx.orm.public.LedgerEntry.create({
      transactionId: transaction.id,
      accountId: fees.id,
      amountKobo: entries[1]!,
    });
    await tx.orm.public.LedgerEntry.create({
      transactionId: transaction.id,
      accountId: wallet.id,
      amountKobo: entries[2]!,
    });
    await tx.orm.public.LedgerEntry.create({
      transactionId: transaction.id,
      accountId: platformFees.id,
      amountKobo: entries[3]!,
    });

    await tx.orm.public.paymentIntent.where({ id: fresh.id }).update({
      status: "SUCCESS",
    });
  });
}
