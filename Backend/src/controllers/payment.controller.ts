import type { Request, Response } from "express";
import { z } from "zod";
import { isValidSignature } from "../lib/paystack.js";
import {
  creditFromWebhook,
  depositStatus,
  startDeposit,
} from "../services/payment.service.js";
import { getAuthenticatedUserId } from "../middleware/requireAuth.js";

const initSchema = z.object({
  amountKobo: z.number().int().min(10_000).max(10_000_000_000),
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
  await creditFromWebhook(req.body);
  return res.sendStatus(200);
}