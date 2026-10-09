import { randomBytes } from "node:crypto";

export type BillOutcome = "DELIVERED" | "FAILED" | "PENDING" | "REVERSED";

const failedCodes = new Set([
  "016", "091", "010", "011", "012", "013", "017", "018", "019", "021",
  "022", "023", "024", "027", "028", "030", "034", "035", "085", "087",
]);

export function classifyVtpassResponse(code: string | undefined, status: string | undefined): BillOutcome {
  const normalized = status?.toLowerCase();
  if (normalized === "reversed" || code === "040") return "REVERSED";
  if (code === "000" && normalized === "delivered") return "DELIVERED";
  if (code === "000" && (normalized === "initiated" || normalized === "pending")) return "PENDING";
  if (code === "099" || code === "089" || code === "014") return "PENDING";
  if (failedCodes.has(code ?? "")) return "FAILED";
  return "PENDING";
}

export function generateProviderRequestId(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now).reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${randomBytes(8).toString("hex")}`;
}

function env(name: string, fallback: string) {
  return process.env[name] ?? process.env[name.replace("VTPASS", "VTU_PASS")] ?? fallback;
}

const baseUrl = () => (process.env.VTPASS_BASE_URL ?? "https://sandbox.vtpass.com").replace(/\/$/, "");

async function callVtpass(path: string, init: RequestInit) {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(20_000),
    headers: {
      "Content-Type": "application/json",
      "api-key": env("VTPASS_API_KEY", ""),
      ...(init.method === "GET"
        ? { "public-key": env("VTPASS_PUBLIC_KEY", "") }
        : { "secret-key": env("VTPASS_SECRET_KEY", "") }),
      ...init.headers,
    },
  });
  const body = await response.text();
  let parsed: unknown = null;
  try { parsed = body ? JSON.parse(body) : null; } catch { /* classified as pending */ }
  if (!response.ok) throw Object.assign(new Error(`VTpass HTTP ${response.status}`), { status: response.status, body: parsed });
  return parsed;
}

export function vtpassResponseDetails(body: unknown) {
  const root = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const content = root.content && typeof root.content === "object" ? root.content as Record<string, unknown> : {};
  const transactions = content.transactions && typeof content.transactions === "object"
    ? content.transactions as Record<string, unknown> : {};
  const code = typeof root.code === "string" ? root.code : undefined;
  const status = typeof transactions.status === "string"
    ? transactions.status
    : typeof root.response_description === "string" ? root.response_description : undefined;
  const total = typeof transactions.total_amount === "number" ? transactions.total_amount
    : typeof content.total_amount === "number" ? content.total_amount : undefined;
  const commission = typeof transactions.commission === "number" ? transactions.commission
    : typeof content.commission === "number" ? content.commission : undefined;
  const transactionId = typeof transactions.transactionId === "string" ? transactions.transactionId : undefined;
  const commissionDetails = transactions.commission_details && typeof transactions.commission_details === "object"
    ? transactions.commission_details as Record<string, unknown> : {};
  const detailedCommission = typeof commissionDetails.amount === "number" ? commissionDetails.amount : undefined;
  return { code, status, total, commission: commission ?? detailedCommission, transactionId };
}

export function purchaseAirtime(input: { requestId: string; serviceId: string; amountNaira: number; phone: string }) {
  return callVtpass("/api/pay", {
    method: "POST",
    body: JSON.stringify({
      request_id: input.requestId,
      serviceID: input.serviceId,
      amount: input.amountNaira,
      phone: input.phone,
    }),
  });
}

export function requeryVtpass(requestId: string) {
  return callVtpass("/api/requery", {
    method: "POST",
    body: JSON.stringify({ request_id: requestId }),
  });
}

export function getVtpassBalance() {
  return callVtpass("/api/balance", { method: "GET" });
}
