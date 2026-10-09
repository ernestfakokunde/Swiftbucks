import type { Request, Response } from "express";
import { z } from "zod";
import { getAuthenticatedUserId } from "../middleware/requireAuth.js";
import {
  AIRTIME_NETWORKS, getUserPurchase, getUserPurchases, purchaseBill,
} from "../services/bills.service.js";

const purchaseSchema = z.object({
  idempotencyKey: z.string().min(1).max(200),
  network: z.enum(["mtn", "glo", "airtel", "etisalat"]),
  phone: z.string().regex(/^0[789][01]\d{8}$/),
  amountKobo: z.number().int().safe().min(Number(process.env.BILLS_AIRTIME_MIN_KOBO ?? 5_000)).max(Number(process.env.BILLS_AIRTIME_MAX_KOBO ?? 1_000_000)),
});

export function networks(_req: Request, res: Response) {
  return res.status(200).json(AIRTIME_NETWORKS);
}

export async function purchase(req: Request, res: Response) {
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const result = await purchaseBill(getAuthenticatedUserId(req), parsed.data);
  return res.status(result.statusCode).json(result.purchase);
}

export async function purchases(req: Request, res: Response) {
  return res.status(200).json(await getUserPurchases(getAuthenticatedUserId(req)));
}

export async function purchaseById(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(404).json({ error: "Purchase not found" });
  return res.status(200).json(await getUserPurchase(getAuthenticatedUserId(req), id));
}
