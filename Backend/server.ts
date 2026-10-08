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
import { errorHandler } from "./src/middleware/errorHandler.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const app = express();
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    credentials: true,
  }),
);

 app.use(express.json({
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

app.use("/api/auth", authRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api", walletRoutes);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;

await db.connect();
app.listen(PORT, () => {
  console.log("Server is running quieltly on port " + PORT);
});
