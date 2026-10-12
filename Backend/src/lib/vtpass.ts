import { randomBytes } from "node:crypto";

export type BillOutcome = "DELIVERED" | "FAILED" | "PENDING" | "REVERSED";

export type VtpassService = { serviceID: string; name: string };
export type VtpassPlan = { variation_code: string; name: string; variation_amount: string; fixedPrice: string };
export interface BillProvider {
  listServices(identifier: string): Promise<VtpassService[]>;
  listPlans(serviceId: string): Promise<unknown>;
  buy(input: { requestId: string; serviceId: string; amountNaira: number; phone: string; variationCode?: string }): Promise<unknown>;
  requery(requestId: string): Promise<unknown>;
  balance(): Promise<unknown>;
}

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

const SANDBOX_BASE_URL = "https://sandbox.vtpass.com";

export function getVtpassBaseUrl(config: {
  configuredUrl?: string | null;
} = {}) {
  const configuredUrl = Object.hasOwn(config, "configuredUrl") ? config.configuredUrl : process.env.VTPASS_BASE_URL;
  return (configuredUrl?.trim() || SANDBOX_BASE_URL)
    .replace(/\/$/, "")
    .replace(/\/api$/i, "");
}

async function callVtpass(path: string, init: RequestInit) {
  const configuredTimeout = Number(process.env.VTPASS_TIMEOUT_MS ?? 45_000);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 5_000
    ? Math.min(configuredTimeout, 100_000)
    : 45_000;
  const response = await fetch(`${getVtpassBaseUrl()}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.VTPASS_API_KEY ?? "",
      ...(init.method === "GET"
        ? { "public-key": process.env.VTPASS_PUBLIC_KEY ?? "" }
        : { "secret-key": process.env.VTPASS_SECRET_KEY ?? "" }),
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
  const amount = typeof transactions.amount === "number" || typeof transactions.amount === "string"
    ? transactions.amount : typeof root.amount === "number" || typeof root.amount === "string" ? root.amount : undefined;
  const unitPrice = typeof transactions.unit_price === "number" || typeof transactions.unit_price === "string"
    ? transactions.unit_price : undefined;
  const responseDescription = typeof root.response_description === "string" ? root.response_description : undefined;
  return { code, status, total, amount, unitPrice, commission: commission ?? detailedCommission, transactionId, responseDescription };
}

export function purchaseAirtime(input: { requestId: string; serviceId: string; amountNaira: number; phone: string }) {
  return buyVtpass(input);
}

export function buyVtpass(input: { requestId: string; serviceId: string; amountNaira: number; phone: string; variationCode?: string }) {
  return callVtpass("/api/pay", {
    method: "POST",
    body: JSON.stringify({
      request_id: input.requestId,
      serviceID: input.serviceId,
      ...(input.variationCode ? { billersCode: input.phone, variation_code: input.variationCode } : {}),
      amount: input.amountNaira,
      phone: input.phone,
    }),
  });
}

export async function listVtpassServices(identifier: string): Promise<VtpassService[]> {
  const result = await callVtpass(`/api/services?identifier=${encodeURIComponent(identifier)}`, { method: "GET" });
  const root = result && typeof result === "object" ? result as { content?: unknown } : {};
  return Array.isArray(root.content) ? root.content.filter((item): item is VtpassService =>
    Boolean(item && typeof item === "object" && typeof (item as VtpassService).serviceID === "string" && typeof (item as VtpassService).name === "string"),
  ) : [];
}

export function listVtpassPlans(serviceId: string) {
  return callVtpass(`/api/service-variations?serviceID=${encodeURIComponent(serviceId)}`, { method: "GET" });
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

export const vtpassProvider: BillProvider = {
  listServices: listVtpassServices,
  listPlans: listVtpassPlans,
  buy: buyVtpass,
  requery: requeryVtpass,
  balance: getVtpassBalance,
};
