import type { Request, Response } from "express";
import { z } from "zod";
import { getAuthenticatedUserId } from "../middleware/requireAuth.js";
import {
  AIRTIME_NETWORKS, getUserPurchase, getUserPurchases, purchaseBill, purchaseDataBill,
} from "../services/bills.service.js";
import { getAvailableDataNetworks, getDataPlans, type DataPlan } from "../services/dataPlans.service.js";

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

const dataNetworks = z.enum(["mtn", "airtel", "glo", "etisalat"]);
export function dataNetworksList(_req: Request, res: Response) { return res.status(200).json(getAvailableDataNetworks()); }
export async function dataPlans(req: Request, res: Response) {
  const parsed = dataNetworks.safeParse(req.query.network);
  if (!parsed.success) return res.status(400).json({ error: "Invalid network" });
  const plans = await getDataPlans(parsed.data);
  return res.status(200).json(plans.map(({ planId, name, sizeLabel, validityLabel, validityBucket, kind, amountKobo }: DataPlan) => ({
    planId, name, sizeLabel, validityLabel, validityBucket, kind, amountKobo,
  })));
}

const dataPurchaseSchema = z.object({
  idempotencyKey: z.string().min(1).max(200),
  network: dataNetworks,
  phone: z.string().regex(/^0[789][01]\d{8}$/),
  planId: z.string().min(1).max(300),
  expectedAmountKobo: z.number().int().safe().positive(),
});

export async function purchaseData(req: Request, res: Response) {
  const parsed = dataPurchaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const result = await purchaseDataBill(getAuthenticatedUserId(req), parsed.data);
  return res.status(result.statusCode).json(result.purchase);
}
