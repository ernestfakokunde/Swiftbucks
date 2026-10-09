import type { Request, Response } from "express";
import { z } from "zod";
import {
  createUserWithWallet,
  deposit,
  getBalanceKobo,
  getTransactions,
  lookupUser,
  p2pTransfer,
  withdraw,
  AppError,
} from "../services/wallet.service.js";
import { getAuthenticatedUserId } from "../middleware/requireAuth.js";
import { withdrawalFeeKobo } from "../lib/fees.js";

const createUserSchema = z.object({
  email: z.email(),
  username: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/),
  password: z.string().min(8).max(128),
});

const moneySchema = z.object({
  amountKobo: z.number().int().safe().positive().max(10_000_000_000),
  reference: z.string().min(1).max(100),
});

const withdrawalSchema = moneySchema.extend({
  amountKobo: z.number().int().safe().min(50_000).max(10_000_000_000),
  bankCode: z.string().regex(/^\d{3,6}$/),
  accountNumber: z.string().regex(/^\d{10}$/),
  bankName: z.string().min(1).max(100),
  accountName: z.string().min(1).max(200),
});

const transferSchema = moneySchema.extend({
  amountKobo: z.number().int().safe().min(100).max(10_000_000_000),
  receiverUsername: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/),
});

const lookupUserSchema = z.object({
  username: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/),
});

export async function createUser(req: Request, res: Response) {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const result = await createUserWithWallet(parsed.data);
  return res.status(201).json(result);
}

export async function getBalance(req: Request, res: Response) {
  const userId = getAuthenticatedUserId(req);
  const balance = await getBalanceKobo(userId);
  return res.status(200).json({ balanceKobo: balance.toString() });
}

export async function depositFunds(req: Request, res: Response) {
  if (process.env.ALLOW_FAKE_DEPOSIT !== "true") {
    return res.status(404).json({ error: "Not found" });
  }

  const userId = getAuthenticatedUserId(req);
  const parsed = moneySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const result = await deposit(
    userId,
    BigInt(parsed.data.amountKobo),
    parsed.data.reference,
  );

  return res.status(result.duplicate ? 200 : 201).json(result);
}

export async function withdrawFunds(req: Request, res: Response) {
  const userId = getAuthenticatedUserId(req);
  const parsed = withdrawalSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const result = await withdraw(
    userId,
    BigInt(parsed.data.amountKobo),
    parsed.data.reference,
    {
      bankCode: parsed.data.bankCode,
      bankName: parsed.data.bankName,
      accountNumber: parsed.data.accountNumber,
      accountName: parsed.data.accountName,
    },
  );

  return res.status(result.duplicate ? 200 : 201).json(result);
}

export function getWithdrawalQuote(req: Request, res: Response) {
  const parsed = z.number().int().safe().min(50_000).max(10_000_000_000).safeParse(
    req.query.amountKobo === undefined ? undefined : Number(req.query.amountKobo),
  );
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const feeKobo = withdrawalFeeKobo(parsed.data);
  return res.status(200).json({
    amountKobo: parsed.data,
    feeKobo,
    totalDebitKobo: parsed.data + feeKobo,
  });
}

export async function transferFunds(req: Request, res: Response) {
  const userId = getAuthenticatedUserId(req);
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const result = await p2pTransfer(
    userId,
    parsed.data.receiverUsername,
    BigInt(parsed.data.amountKobo),
    parsed.data.reference,
  );

  return res.status(result.duplicate ? 200 : 201).json(result);
}

export async function lookup(req: Request, res: Response) {
  const parsed = lookupUserSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const user = await lookupUser(parsed.data.username);
  return res.status(200).json(user);
}

export async function getTransactionHistory(req: Request, res: Response) {
  const userId = getAuthenticatedUserId(req);
  const transactions = await getTransactions(userId);
  return res.status(200).json(transactions);
}
