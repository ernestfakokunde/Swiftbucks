import "dotenv/config";
import { performance } from "node:perf_hooks";
import { getVtpassBalance, requeryVtpass } from "../src/lib/vtpass.js";

async function time(label: string, fn: () => Promise<unknown>) {
  const start = performance.now();
  try { await fn(); } catch { /* the status doesn't matter, only the time */ }
  console.log(label.padEnd(10), Math.round(performance.now() - start), "ms");
}

for (let i = 0; i < 3; i++) {
  await time("balance", () => getVtpassBalance());
  await time("requery", () => requeryVtpass("202601010000timing" + i));
}