import "dotenv/config";
import type { Request } from "express";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { db } from "./src/prisma/db.js";
import walletRoutes from "./src/routes/wallet.routes.js";
import authRoutes from "./src/routes/auth.routes.js";
import webhookRoutes from "./src/routes/webhook.routes.js";
import billsRoutes from "./src/routes/bills.routes.js";
import { errorHandler } from "./src/middleware/errorHandler.js";
import { seedSystemAccounts } from "./src/services/systemAccounts.service.js";
import { reconcileFinancialFlows } from "./src/services/reconcile.service.js";
import { refreshAvailableDataServices } from "./src/services/dataPlans.service.js";
import { csrfProtection } from "./src/middleware/csrf.js";
import { getVtpassBaseUrl } from "./src/lib/vtpass.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}
for (const key of ["VTPASS_API_KEY", "VTPASS_PUBLIC_KEY", "VTPASS_SECRET_KEY"] as const) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}
if (process.env.NODE_ENV === "production") {
  console.info("VTPASS_ENVIRONMENT", getVtpassBaseUrl().includes("sandbox") ? "sandbox" : "live");
  if (process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test")) {
    console.warn("PAYSTACK_TEST_KEY_IN_PRODUCTION", "Paystack requests will use test mode");
  }
}

const app = express();
if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    credentials: true,
  }),
);

app.use("/api/webhooks/paystack", express.json({
  limit: "100kb",
  verify: (req, _res, buf) => { (req as Request).rawBody = buf; },
}));
app.use("/api/webhooks", express.json({
  limit: "10kb",
  verify: (req, _res, buf) => { (req as Request).rawBody = buf; },
}));
app.use(cookieParser());
app.use(csrfProtection);

app.get("/", (req, res) => {
  res.send("Hello Swiftbuck api at your service");
});
app.get("/health", (req, res) => {
  res.send("Swiftbuck api is healthy");
});
app.get("/ready", async (_req, res) => {
  try {
    await db.transaction(async (tx) => tx.query(db.raw.sql`SELECT 1 AS ready`.returnsRow({ ready: "pg/int4@1" }).build()));
    return res.status(200).json({ ready: true });
  } catch {
    return res.status(503).json({ ready: false });
  }
});

app.use(express.json({
  limit: "10kb",
}));
app.use("/api/auth", authRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api", walletRoutes);
app.use("/api/bills", billsRoutes);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;

await db.connect();
await seedSystemAccounts();
await refreshAvailableDataServices();
app.listen(PORT, () => {
  console.log("Server is running quieltly on port " + PORT);
});
setInterval(() => void reconcileFinancialFlows().catch((error) => console.error("BILLS_RECONCILE_FAILED", error)), 60_000);
