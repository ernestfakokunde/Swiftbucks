import type { Request, Response } from "express";
import { z } from "zod";
import { isValidSignature } from "../lib/paystack.js";
import {
  creditFromWebhook,
  depositStatus,
  depositQuote,
  startDeposit,
} from "../services/payment.service.js";
import { settleWithdrawal } from "../services/wallet.service.js";
import { getAuthenticatedUserId } from "../middleware/requireAuth.js";

const initSchema = z.object({
  amountKobo: z.number().int().safe().min(50_000).max(10_000_000_000),
});

const chargeSuccessSchema = z.object({
  event: z.literal("charge.success"),
  data: z.object({
    reference: z.string().min(1),
    amount: z.number().int().positive(),
    currency: z.string(),
    fees: z.number().int().nonnegative().optional(),
  }),
});

const transferSchema = z.object({
  event: z.enum(["transfer.success", "transfer.failed", "transfer.reversed"]),
  data: z.object({
    reference: z.string().min(1),
    amount: z.number().int().positive().optional(),
    currency: z.string().optional(),
    fees: z.number().int().nonnegative().optional(),
  }),
});

export async function initializeDeposit(req: Request, res: Response) {
  const parsed = initSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const result = await startDeposit(
    getAuthenticatedUserId(req),
    parsed.data.amountKobo,
  );
  return res.status(201).json(result);
}

export async function getDepositQuote(req: Request, res: Response) {
  const parsed = z.number().int().safe().min(50_000).max(10_000_000_000).safeParse(
    req.query.amountKobo === undefined ? undefined : Number(req.query.amountKobo),
  );
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  return res.status(200).json(depositQuote(parsed.data));
}

export async function getDepositStatus(req: Request, res: Response) {
  const reference = z.string().min(1).safeParse(req.query.reference);
  if (!reference.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  return res
    .status(200)
    .json(await depositStatus(getAuthenticatedUserId(req), reference.data));
}

export async function paystackWebhook(req: Request, res: Response) {
  const signature = req.header("x-paystack-signature");
  if (!req.rawBody || !isValidSignature(req.rawBody, signature)) {
    return res.status(401).json({ error: "Invalid signature" });
  }
  const charge = chargeSuccessSchema.safeParse(req.body);
  if (charge.success) {
    if (charge.data.data.fees !== undefined && charge.data.data.fees > charge.data.data.amount) {
      console.error("Malformed charge.success webhook");
      return res.sendStatus(200);
    }
    await creditFromWebhook(charge.data);
    return res.sendStatus(200);
  }

  const transfer = transferSchema.safeParse(req.body);
  if (transfer.success) {
    await settleWithdrawal({
      reference: transfer.data.data.reference,
      status: transfer.data.event === "transfer.success" ? "SUCCESS" : transfer.data.event === "transfer.reversed" ? "REVERSED" : "FAILED",
      amountKobo: transfer.data.data.amount,
      currency: transfer.data.data.currency,
      costKobo: transfer.data.data.fees,
    });
    return res.sendStatus(200);
  }

  console.error("Ignoring unknown or malformed Paystack webhook event");
  return res.sendStatus(200);
}