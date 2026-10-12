import "dotenv/config";
import { db } from "../src/prisma/db.js";
import { reconcileFinancialFlows } from "../src/services/reconcile.service.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
await db.connect();
try {
  const summary = await reconcileFinancialFlows();
  console.log(JSON.stringify(summary));
  process.exit(summary.acquired === false ? 0 : 0);
} catch (error) {
  console.error("RECONCILE_RUN_FAILED", error instanceof Error ? error.message : "reconcile failed");
  process.exit(1);
}
