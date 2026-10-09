import type { Request, Response } from "express";
import { z } from "zod";
import { getBanks, resolveBankAccount } from "../services/bank.service.js";

const resolveSchema = z.object({
  accountNumber: z.string().regex(/^\d{10}$/),
  bankCode: z.string().regex(/^\d{3,6}$/),
});

export async function banks(_req: Request, res: Response) {
  return res.status(200).json(await getBanks());
}

export async function resolve(req: Request, res: Response) {
  const parsed = resolveSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  return res.status(200).json(await resolveBankAccount(parsed.data.accountNumber, parsed.data.bankCode));
}
