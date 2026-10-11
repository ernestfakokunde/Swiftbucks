import "dotenv/config";

const clean = (n: string) => process.env[n]?.trim().replace(/^["']|["']$/g, "") ?? "";
const base = (process.env.VTPASS_BASE_URL ?? process.env.VTU_PASS_BASE_URL ?? "https://sandbox.vtpass.com").replace(/\/$/, "");

for (const n of ["VTPASS_API_KEY", "VTPASS_PUBLIC_KEY", "VTPASS_SECRET_KEY", "VTU_PASS_API_KEY", "VTU_PASS_PUBLIC_KEY", "VTU_PASS_SECRET_KEY"]) {
  const raw = process.env[n];
  console.log(n.padEnd(22), raw ? `set, ${raw.length} chars${raw !== raw.trim() ? ", HAS SPACES" : ""}${/^["']|["']$/.test(raw) ? ", HAS QUOTES" : ""}` : "missing");
}
console.log("base url:", base);

const api = clean("VTPASS_API_KEY") || clean("VTU_PASS_API_KEY");
const pub = clean("VTPASS_PUBLIC_KEY") || clean("VTU_PASS_PUBLIC_KEY");
const sec = clean("VTPASS_SECRET_KEY") || clean("VTU_PASS_SECRET_KEY");

const g = await fetch(`${base}/api/balance`, { headers: { "api-key": api, "public-key": pub } });
console.log("GET  /api/balance ->", g.status, (await g.text()).slice(0, 200));

const p = await fetch(`${base}/api/requery`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "api-key": api, "secret-key": sec },
  body: JSON.stringify({ request_id: "202601010000diagnostic0001" }),
});
console.log("POST /api/requery ->", p.status, (await p.text()).slice(0, 200));