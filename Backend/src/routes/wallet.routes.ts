import { Router } from "express";
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

const router = Router();

router.post("/users", asyncHandler(createUser));
router.get(
  "/wallets/:userId/balance",
  asyncHandler<{ userId: string }>(getBalance),
);
router.post(
  "/wallets/:userId/deposit",
  asyncHandler<{ userId: string }>(depositFunds),
);
router.post(
  "/wallets/:userId/withdraw",
  asyncHandler<{ userId: string }>(withdrawFunds),
);
router.post(
  "/wallets/:userId/transfer",
  asyncHandler<{ userId: string }>(transferFunds),
);
router.get("/users/lookup", asyncHandler(lookup));
router.get(
  "/wallets/:userId/transactions",
  asyncHandler<{ userId: string }>(getTransactionHistory),
);

export default router;
