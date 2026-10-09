import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { walletPostLimiter } from "../middleware/rateLimit.js";
import { networks, purchase, purchaseById, purchases } from "../controllers/bills.controller.js";

const router = Router();
router.use(requireAuth);
router.get("/airtime/networks", networks);
router.post("/airtime/purchase", walletPostLimiter, purchase);
router.get("/purchases", purchases);
router.get("/purchases/:id", purchaseById);

export default router;
