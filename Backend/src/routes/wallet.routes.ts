import { Router } from "express";
import { z } from "zod";
import {
  createUser,
  depositFunds,
  getBalance,
  getTransactionHistory,
  lookup,
  transferFunds,
  withdrawFunds,
} from "../controllers/wallet.controller";
import { asyncHandler } from "../middleware/asyncHandler";
import { validate } from "../middleware/validate";

const router = Router();

const userIdParams = z.object({
  userId: z.coerce.number().int().positive(),
});

const moneyRequest = z.object({
  amountKobo: z.number().int().positive(),
  reference: z.string().trim().min(1),
});

const transferRequest = moneyRequest.extend({
  receiverUsername: z.string().trim().min(1),
});

const userRequest = z.object({
  email: z.string().email(),
  username: z.string().trim().min(3).max(20),
});

const lookupRequest = z.object({
  username: z.string().trim().min(1),
});

const withUserId = (body: z.ZodType) => ({
  params: userIdParams,
  body,
});

router.post("/users", validate({ body: userRequest }), asyncHandler(createUser));
router.get(
  "/wallets/:userId/balance",
  validate({ params: userIdParams }),
  asyncHandler<{ userId: string }>(getBalance),
);
router.post(
  "/wallets/:userId/deposit",
  validate(withUserId(moneyRequest)),
  asyncHandler<{ userId: string }>(depositFunds),
);
router.post(
  "/wallets/:userId/withdraw",
  validate(withUserId(moneyRequest)),
  asyncHandler<{ userId: string }>(withdrawFunds),
);
router.post(
  "/wallets/:userId/transfer",
  validate(withUserId(transferRequest)),
  asyncHandler<{ userId: string }>(transferFunds),
);
router.get(
  "/users/lookup",
  validate({ query: lookupRequest }),
  asyncHandler(lookup),
);
router.get(
  "/wallets/:userId/transactions",
  validate({ params: userIdParams }),
  asyncHandler<{ userId: string }>(getTransactionHistory),
);

export default router;
