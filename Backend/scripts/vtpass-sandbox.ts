const numbers = ["08011111111", "201000000000", "300000000000", "400000000000", "500000000000", `080${Math.floor(10000000 + Math.random() * 89999999)}`];
const base = (process.env.VTPASS_BASE_URL ?? "https://sandbox.vtpass.com").replace(/\/$/, "");
const apiKey = process.env.VTPASS_API_KEY ?? process.env.VTU_PASS_API_KEY;
const secretKey = process.env.VTPASS_SECRET_KEY ?? process.env.VTU_PASS_SECRET_KEY;
if (!apiKey || !secretKey) throw new Error("VTPASS API credentials are required");
for (const phone of numbers) {
  const requestId = `${Date.now()}${Math.random().toString(36).slice(2, 14)}`;
  try {
    const response = await fetch(`${base}/api/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey, "secret-key": secretKey },
      body: JSON.stringify({ request_id: requestId, serviceID: "mtn", amount: 100, phone }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.text();
    console.log(`${phone}: HTTP ${response.status} ${body.slice(0, 300)}`);
  } catch (error) {
    console.log(`${phone}: ${error instanceof Error ? error.message : "timeout/network error"}`);
  }
}
