import { Router } from "express";
import { paystackWebhook } from "../controllers/payment.controller.js";
import { z } from "zod";
import { db } from "../prisma/db.js";
import { requeryPurchase } from "../services/bills.service.js";
import { webhookLimiter } from "../middleware/rateLimit.js";

const router = Router();

router.post("/paystack", paystackWebhook);
router.post("/vtpass", webhookLimiter, (req, res) => {
  const parsed = z.object({ type: z.literal("transaction-update"), data: z.object({ requestId: z.string() }) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid webhook" });
  res.json({ response: "success" });
  void (async () => {
    try {
      const purchase = await db.orm.public.BillPurchase.where({ providerRequestId: parsed.data.data.requestId }).first();
      if (purchase) await requeryPurchase(purchase.id);
    } catch (error) {
      console.error("BILL_WEBHOOK_PROCESSING_FAILED", error);
    }
  })();
});

export default router;
