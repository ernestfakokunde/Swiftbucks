import { Router } from "express";
import {
  createUser,
  depositFunds,
  getBalance,
  getTransactionHistory,
  lookup,
  transferFunds,
  withdrawFunds,
  getWithdrawalQuote,
} from "../controllers/wallet.controller.js";
import {
  getDepositStatus,
  initializeDeposit,
  getDepositQuote,
} from "../controllers/payment.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  lookupLimiter,
  signupLimiter,
  walletPostLimiter,
  depositStatusLimiter,
  bankResolveLimiter,
  quoteLimiter,
} from "../middleware/rateLimit.js";
import { banks, resolve } from "../controllers/bank.controller.js";

const router = Router();

router.post("/users", signupLimiter, createUser);
router.use(requireAuth);
router.get("/banks", banks);
router.get("/banks/resolve", bankResolveLimiter, resolve);
router.get("/wallet/balance", getBalance);
router.get("/wallet/transactions", getTransactionHistory);
router.post("/wallet/deposit", walletPostLimiter, depositFunds);
router.post(
  "/wallet/deposit/initialize",
  walletPostLimiter,
  initializeDeposit,
);
router.get("/wallet/deposit/quote", quoteLimiter, getDepositQuote);
router.get("/wallet/deposit/status", depositStatusLimiter, getDepositStatus);
router.get("/wallet/withdraw/quote", quoteLimiter, getWithdrawalQuote);
router.post("/wallet/withdraw", walletPostLimiter, withdrawFunds);
router.post("/wallet/transfer", walletPostLimiter, transferFunds);
router.get("/users/lookup", lookupLimiter, lookup);

export default router;
