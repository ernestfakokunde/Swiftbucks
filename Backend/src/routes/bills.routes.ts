import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { dataPlanLimiter, walletPostLimiter } from "../middleware/rateLimit.js";
import { dataNetworksList, dataPlans, networks, purchase, purchaseById, purchaseData, purchases } from "../controllers/bills.controller.js";

const router = Router();
router.use(requireAuth);
router.get("/airtime/networks", networks);
router.post("/airtime/purchase", walletPostLimiter, purchase);
router.get("/data/networks", dataPlanLimiter, dataNetworksList);
router.get("/data/plans", dataPlanLimiter, dataPlans);
router.post("/data/purchase", walletPostLimiter, purchaseData);
router.get("/purchases", purchases);
router.get("/purchases/:id", purchaseById);

export default router;
