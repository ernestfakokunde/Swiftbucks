import type { Request, Response } from "express";
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

function userIdFrom(req: Request<UserIdParams>): number {
  return Number(req.params.userId);
}

export async function createUser(req: Request, res: Response) {
  const result = await createUserWithWallet(req.body);
  return res.status(201).json(result);
}

export async function getBalance(
  req: Request<UserIdParams>,
  res: Response,
) {
  const balance = await getBalanceKobo(userIdFrom(req));
  return res.status(200).json({ balanceKobo: balance.toString() });
}

export async function depositFunds(
  req: Request<UserIdParams>,
  res: Response,
) {
  const { amountKobo, reference } = req.body;
  const result = await deposit(
    userIdFrom(req),
    BigInt(amountKobo),
    reference,
  );

  return res.status(result.duplicate ? 200 : 201).json(result);
}

export async function withdrawFunds(
  req: Request<UserIdParams>,
  res: Response,
) {
  const { amountKobo, reference } = req.body;
  const result = await withdraw(
    userIdFrom(req),
    BigInt(amountKobo),
    reference,
  );

  return res.status(result.duplicate ? 200 : 201).json(result);
}

export async function transferFunds(
  req: Request<UserIdParams>,
  res: Response,
) {
  const { receiverUsername, amountKobo, reference } = req.body;
  const result = await p2pTransfer(
    userIdFrom(req),
    receiverUsername,
    BigInt(amountKobo),
    reference,
  );

  return res.status(result.duplicate ? 200 : 201).json(result);
}

export async function lookup(req: Request, res: Response) {
  const user = await lookupUser(req.query.username as string);
  return res.status(200).json(user);
}

export async function getTransactionHistory(
  req: Request<UserIdParams>,
  res: Response,
) {
  const transactions = await getTransactions(userIdFrom(req));
  return res.status(200).json(transactions);
}
