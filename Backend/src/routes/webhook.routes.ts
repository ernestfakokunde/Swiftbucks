import { Router } from "express";
import { paystackWebhook } from "../controllers/payment.controller.js";

const router = Router();

router.post("/paystack", paystackWebhook);

export default router;
