import { randomBytes } from "node:crypto";
import { db } from "../prisma/db.js";
import { initializePayment } from "../lib/paystack.js";
import { AppError } from "./wallet.service.js";

export async function startDeposit(userId: number, amountKobo: number) {
  const user = await db.orm.public.User.where({ id: userId }).first();
  if (!user) throw new AppError(401, "Not logged in");

  const reference = `dep_${randomBytes(12).toString("hex")}`;

  await db.orm.public.paymentIntent.create({
    reference,
    userId,
    amountKobo: BigInt(amountKobo),
  });

  try {
    const data = await initializePayment({
      email: user.email,
      amountKobo,
      reference,
      callbackUrl: `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/add-money/done`,
    });
    return { authorizationUrl: data.authorization_url, reference };
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
  return { status: intent.status };
}

export async function creditFromWebhook(event: {
  event: string;
  data: { reference: string; amount: number };
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

    if (BigInt(event.data.amount) !== BigInt(fresh.amountKobo)) {
      await tx.orm.public.paymentIntent.where({ id: fresh.id }).update({
        status: "MISMATCH",
      });
      console.error("Amount mismatch for", fresh.reference);
      return;
    }

    const wallet = await tx.orm.public.Account.where({
      userId: fresh.userId,
      kind: "USER_WALLET",
    }).first();
    if (!wallet) throw new Error("Wallet missing for intent " + fresh.reference);

    let holding = await tx.orm.public.Account.where({
      kind: "SYSTEM_PAYSTACK_HOLDING",
    }).first();
    if (!holding) {
      holding = await tx.orm.public.Account.create({
        kind: "SYSTEM_PAYSTACK_HOLDING",
        currency: "NGN",
      });
    }

    const transaction = await tx.orm.public.Transaction.create({
      reference: fresh.reference,
      type: "DEPOSIT",
      status: "COMPLETED",
    });

    await tx.orm.public.LedgerEntry.create({
      transactionId: transaction.id,
      accountId: holding.id,
      amountKobo: -BigInt(fresh.amountKobo),
    });
    await tx.orm.public.LedgerEntry.create({
      transactionId: transaction.id,
      accountId: wallet.id,
      amountKobo: BigInt(fresh.amountKobo),
    });

    await tx.orm.public.paymentIntent.where({ id: fresh.id }).update({
      status: "SUCCESS",
    });
  });
}
