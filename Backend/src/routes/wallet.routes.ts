import { Router } from "express";
import {
  createUser,
  depositFunds,
  getBalance,
  getTransactionHistory,
  lookup,
  transferFunds,
  withdrawFunds,
} from "../controllers/wallet.controller.js";
import {
  getDepositStatus,
  initializeDeposit,
} from "../controllers/payment.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  lookupLimiter,
  signupLimiter,
  walletPostLimiter,
} from "../middleware/rateLimit.js";

const router = Router();

router.post("/users", signupLimiter, createUser);
router.use(requireAuth);
router.get("/wallet/balance", getBalance);
router.get("/wallet/transactions", getTransactionHistory);
router.post("/wallet/deposit", walletPostLimiter, depositFunds);
router.post(
  "/wallet/deposit/initialize",
  walletPostLimiter,
  initializeDeposit,
);
router.get("/wallet/deposit/status", getDepositStatus);
router.post("/wallet/withdraw", walletPostLimiter, withdrawFunds);
router.post("/wallet/transfer", walletPostLimiter, transferFunds);
router.get("/users/lookup", lookupLimiter, lookup);

export default router;
