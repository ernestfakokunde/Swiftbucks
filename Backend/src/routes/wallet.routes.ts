import { Router} from "express";
import { createUser, getBalance, depositFunds, withdrawFunds,
         transferFunds, lookup

} from "../controllers/wallet.controller";

const router = Router();

router.post("/users", createUser);
router.get("/wallets/:userId/balance", getBalance);
router.post("/wallets/:userId/deposit", depositFunds);
router.post("/wallets/:userId/withdraw", withdrawFunds);
router.post("/wallets/:userId/transfer", transferFunds);
router.get("/users/lookup", lookup);

export default router;