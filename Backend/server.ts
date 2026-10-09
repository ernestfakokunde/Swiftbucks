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
import { reconcileBills } from "./src/services/bills.service.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}
for (const [primary, legacy] of [
  ["VTPASS_API_KEY", "VTU_PASS_API_KEY"],
  ["VTPASS_PUBLIC_KEY", "VTU_PASS_PUBLIC_KEY"],
  ["VTPASS_SECRET_KEY", "VTU_PASS_SECRET_KEY"],
] as const) {
  if (!process.env[primary] && !process.env[legacy]) throw new Error(`${primary} is required`);
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

app.use("/api/webhooks", express.json({
  limit: "10kb",
  verify: (req, _res, buf) => { (req as Request).rawBody = buf; },
}));
app.use(cookieParser());

app.get("/", (req, res) => {
  res.send("Hello Swiftbuck api at your service");
});
app.get("/health", (req, res) => {
  res.send("Swiftbuck api is healthy");
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
app.listen(PORT, () => {
  console.log("Server is running quieltly on port " + PORT);
});
setInterval(() => void reconcileBills().catch((error) => console.error("BILLS_RECONCILE_FAILED", error)), 60_000);
