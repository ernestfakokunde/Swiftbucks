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
} from "../services/wallet.service";

type UserIdParams = { userId: string };

const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(20),
  password: z.string().min(1),
});

const userIdSchema = z.coerce.number().int().positive();

const moneySchema = z.object({
  amountKobo: z.number().int().positive(),
  reference: z.string().min(1),
});

const transferSchema = moneySchema.extend({
  receiverUsername: z.string().min(1),
});

const lookupUserSchema = z.object({
  username: z.string().min(1),
});

function parseUserId(req: Request<UserIdParams>): number | null {
  const result = userIdSchema.safeParse(req.params.userId);
  return result.success ? result.data : null;
}

export async function createUser(req: Request, res: Response) {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const result = await createUserWithWallet(parsed.data);
  return res.status(201).json(result);
}

export async function getBalance(
  req: Request<UserIdParams>,
  res: Response,
) {
  const userId = parseUserId(req);
  if (userId === null) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  const balance = await getBalanceKobo(userId);
  return res.status(200).json({ balanceKobo: balance.toString() });
}

export async function depositFunds(
  req: Request<UserIdParams>,
  res: Response,
) {
  const userId = parseUserId(req);
  if (userId === null) {
    return res.status(400).json({ error: "Invalid user id" });
  }

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

export async function withdrawFunds(
  req: Request<UserIdParams>,
  res: Response,
) {
  const userId = parseUserId(req);
  if (userId === null) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  const parsed = moneySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const result = await withdraw(
    userId,
    BigInt(parsed.data.amountKobo),
    parsed.data.reference,
  );

  return res.status(result.duplicate ? 200 : 201).json(result);
}

export async function transferFunds(
  req: Request<UserIdParams>,
  res: Response,
) {
  const userId = parseUserId(req);
  if (userId === null) {
    return res.status(400).json({ error: "Invalid user id" });
  }

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

export async function getTransactionHistory(
  req: Request<UserIdParams>,
  res: Response,
) {
  const userId = parseUserId(req);
  if (userId === null) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  const transactions = await getTransactions(userId);
  return res.status(200).json(transactions);
}
