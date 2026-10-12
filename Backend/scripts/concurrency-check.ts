import "dotenv/config";
import { createHmac, randomBytes } from "node:crypto";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4000";
if (!/^http:\/\/localhost[:/]/.test(BASE)) throw new Error("This script only runs against localhost");
const ORIGIN = process.env.FRONTEND_URL ?? "http://localhost:3000";
const SECRET = process.env.PAYSTACK_SECRET_KEY ?? "";
if (!SECRET.startsWith("sk_test")) throw new Error("Needs a Paystack TEST secret key in .env");

const run = `t${Date.now().toString(36)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const timed = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
const results: Array<[string, boolean]> = [];
const check = (name: string, ok: boolean, note: string) => {
  results.push([name, ok]);
  console.log(ok ? "PASS" : "FAIL", name, "-", note);
};
const tally = (rs: Array<{ status: number }>) => {
  const t: Record<number, number> = {};
  for (const r of rs) t[r.status] = (t[r.status] ?? 0) + 1;
  return JSON.stringify(t);
};

type User = { cookie: string; username: string };

async function api(path: string, o: { method?: string; body?: unknown; cookie?: string } = {}) {
  const res = await fetch(BASE + path, {
    method: o.method ?? "GET",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...(o.cookie ? { Cookie: o.cookie } : {}) },
    body: o.body ? JSON.stringify(o.body) : null,
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { res, status: res.status, json };
}

async function makeUser(tag: string): Promise<User> {
  const username = `${run}${tag}`.slice(0, 20);
  const email = `${username}@example.test`;
  const password = "Passw0rd-" + randomBytes(6).toString("hex");
  const s = await api("/api/users", { method: "POST", body: { email, username, password } });
  if (s.status !== 201) {
    const detail = s.json?.error ?? s.json?.message ?? JSON.stringify(s.json);
    throw new Error(`signup failed: ${s.status}${detail ? ` (${detail})` : ""}`);
  }
  const l = await api("/api/auth/login", { method: "POST", body: { email, password } });
  if (l.status !== 200) throw new Error("login failed: " + l.status);
  const cookie = l.res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { cookie, username };
}

const sign = (body: string) => createHmac("sha512", SECRET).update(body).digest("hex");
const webhook = (payload: object) => {
  const body = JSON.stringify(payload);
  return fetch(BASE + "/api/webhooks/paystack", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-paystack-signature": sign(body) },
    body,
  });
};
const chargeEvent = (reference: string, amount: number) => ({
  event: "charge.success",
  data: { reference, amount, currency: "NGN", fees: 0 },
});

async function startDeposit(u: User, amountKobo: number) {
  const init = await api("/api/wallet/deposit/initialize", { method: "POST", cookie: u.cookie, body: { amountKobo } });
  if (init.status !== 201) {
    const detail = init.json?.error ?? init.json?.message ?? JSON.stringify(init.json);
    throw new Error(`initialize failed: ${init.status}${detail ? ` (${detail})` : ""}`);
  }
  return init.json as { reference: string; creditKobo?: number };
}
async function fund(u: User, amountKobo: number) {
  const d = await startDeposit(u, amountKobo);
  await webhook(chargeEvent(d.reference, amountKobo));
}
async function balance(u: User) {
  const r = await api("/api/wallet/balance", { cookie: u.cookie });
  return BigInt(r.json.balanceKobo);
}
const transfer = (from: User, to: User, amountKobo: number, reference: string) =>
  api("/api/wallet/transfer", { method: "POST", cookie: from.cookie, body: { receiverUsername: to.username, amountKobo, reference } });

const a = await makeUser("a");
const b = await makeUser("b");
const c = await makeUser("c");
await fund(a, 500_000);
await fund(b, 500_000);
await fund(c, 100_000);

// 1. same reference sent 10 times at once
{
  const key = `${run}-same`;
  const before = await balance(a);
  const rs = await Promise.all(Array.from({ length: 10 }, () => transfer(a, b, 10_000, key)));
  const after = await balance(a);
  const created = rs.filter((r) => r.status === 201).length;
  check("1 same reference x10", created === 1 && before - after === 10_000n, `statuses ${tally(rs)}, debit ${before - after}`);
}
await sleep(65_000); // wallet POST limiter is 30 per minute per IP

// 2. overspend
{
  const bal = await balance(c);
  const amt = Number(bal * 4n / 10n);
  const rs = await Promise.all(Array.from({ length: 6 }, (_, i) => transfer(c, a, amt, `${run}-over${i}`)));
  const after = await balance(c);
  const ok = rs.filter((r) => r.status === 201).length;
  check("2 overspend", ok === 2 && after >= 0n && after === bal - BigInt(amt * ok), `statuses ${tally(rs)}, final ${after}`);
}
await sleep(65_000);

// 3. opposite transfers
{
  const before = (await balance(a)) + (await balance(b));
  try {
    const rs = await timed(
      Promise.all([
        ...Array.from({ length: 10 }, (_, i) => transfer(a, b, 100, `${run}-ab${i}`)),
        ...Array.from({ length: 10 }, (_, i) => transfer(b, a, 100, `${run}-ba${i}`)),
      ]),
      30_000,
    );
    const after = (await balance(a)) + (await balance(b));
    check("3 opposite transfers", rs.every((r) => r.status === 201) && before === after, `statuses ${tally(rs)}, total ${before} -> ${after}`);
  } catch {
    check("3 opposite transfers", false, "TIMEOUT: possible deadlock");
  }
}
await sleep(65_000);

// 4. same webhook 10 times at once
{
  const d = await startDeposit(a, 50_000);
  const before = await balance(a);
  await Promise.all(Array.from({ length: 10 }, () => webhook(chargeEvent(d.reference, 50_000))));
  const delta = (await balance(a)) - before;
  check("4 webhook x10", d.creditKobo !== undefined ? delta === BigInt(d.creditKobo) : delta > 0n, `credited ${delta}, expected one credit of ${d.creditKobo ?? "unknown"}`);
}

// 5. optional: airtime double-submit
if (process.argv.includes("--bills")) {
  const key = `${run}-bill`;
  const before = await balance(a);
  const rs = await Promise.all(Array.from({ length: 8 }, () =>
    api("/api/bills/airtime/purchase", { method: "POST", cookie: a.cookie,
      body: { idempotencyKey: key, network: "mtn", phone: "08011111111", amountKobo: 10_000 } })));
  const ids = new Set(rs.map((r) => r.json?.id).filter(Boolean));
  const debit = before - (await balance(a));
  check("5 airtime x8", ids.size === 1 && debit <= 10_000n, `statuses ${tally(rs)}, purchases ${ids.size}, net debit ${debit}`);
}

console.log("\n" + results.map(([n, ok]) => `${ok ? "PASS" : "FAIL"}  ${n}`).join("\n"));
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
