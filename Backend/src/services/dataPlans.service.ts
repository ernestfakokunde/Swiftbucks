import { AppError } from "../lib/errors.js";
import { vtpassProvider, type BillProvider } from "../lib/vtpass.js";

export type DataNetwork = "mtn" | "airtel" | "glo" | "etisalat";
export type DataPlan = {
  planId: string;
  name: string;
  sizeLabel: string | null;
  validityLabel: string | null;
  validityBucket: "daily" | "weekly" | "monthly" | "longterm" | "other";
  kind: "SME" | "STANDARD";
  amountKobo: number;
  serviceId: string;
  variationCode: string;
};

const configuredServices: Record<DataNetwork, string[]> = {
  mtn: ["mtn-data"],
  airtel: ["airtel-data"],
  glo: ["glo-data", "glo-sme-data"],
  etisalat: ["etisalat-data", "9mobile-sme-data"],
};
const networkNames: Record<DataNetwork, string> = { mtn: "MTN", airtel: "Airtel", glo: "Glo", etisalat: "9mobile" };
const cache = new Map<string, { plans: DataPlan[]; expiresAt: number }>();
let availableServices: Set<string> | null = null;
const cacheMs = 60 * 60 * 1000;

export function serviceIdsForNetwork(network: string, available = availableServices): string[] {
  if (!(network in configuredServices)) return [];
  const configured = configuredServices[network as DataNetwork];
  return configured.filter((id) => !available || available.has(id));
}

export function getAvailableDataNetworks() {
  return (Object.keys(configuredServices) as DataNetwork[])
    .filter((network) => serviceIdsForNetwork(network).length > 0)
    .map((id) => ({ id, name: networkNames[id] }));
}

export async function refreshAvailableDataServices(provider: BillProvider = vtpassProvider) {
  try {
    const services = await provider.listServices("data");
    availableServices = new Set(services.map((service) => service.serviceID));
    const configured = new Set(Object.values(configuredServices).flat());
    for (const serviceId of configured) {
      if (!availableServices.has(serviceId)) console.warn("DATA_SERVICE_MISSING", serviceId);
    }
    return [...availableServices];
  } catch (error) {
    availableServices = new Set();
    console.error("DATA_SERVICES_UNAVAILABLE", error instanceof Error ? error.message : "provider error");
    return [];
  }
}

export function amountNairaToKobo(value: unknown): number | null {
  const decimal = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  if (!/^\d+(?:\.\d{1,2})?$/.test(decimal)) return null;
  const [whole = "0", fraction = ""] = decimal.split(".");
  const kobo = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  return kobo <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(kobo) : null;
}

function getVariations(body: unknown): unknown[] {
  const root = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const content = root.content && typeof root.content === "object" ? root.content as Record<string, unknown> : {};
  const variations = Array.isArray(content.variations) ? content.variations : content.varations;
  return Array.isArray(variations) ? variations : [];
}

function getVoicePattern() {
  try { return new RegExp(process.env.BILLS_DATA_EXCLUDED_NAME_PATTERN ?? "voice|xtratalk|talk", "i"); }
  catch { return /voice|xtratalk|talk/i; }
}

function validityFromName(name: string) {
  const match = name.match(/\b(\d+(?:\.\d+)?)\s*(days?|days?|d|hrs?|hours?)\b/i);
  if (!match) return { validityLabel: null, validityBucket: "other" as const };
  const quantity = Number(match[1]);
  const unit = (match[2] ?? "").toLowerCase();
  const days = /^(?:h|hr|hrs|hour|hours)$/.test(unit) ? quantity / 24 : quantity;
  const validityLabel = `${match[1]} ${unit}`;
  const validityBucket: DataPlan["validityBucket"] = days <= 2 ? "daily" : days <= 14 ? "weekly" : days <= 31 ? "monthly" : "longterm";
  return { validityLabel, validityBucket };
}

export function parseDataPlans(serviceId: string, body: unknown): { plans: DataPlan[]; droppedVoice: number; duplicateCodes: string[] } {
  const items = getVariations(body).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  const counts = new Map<string, number>();
  for (const item of items) if (typeof item.variation_code === "string") counts.set(item.variation_code, (counts.get(item.variation_code) ?? 0) + 1);
  const duplicateCodes = [...counts].filter(([, count]) => count > 1).map(([code]) => code);
  for (const code of duplicateCodes) console.warn("DATA_PLAN_DUPLICATE_CODE", serviceId, code);
  const voicePattern = getVoicePattern();
  let droppedVoice = 0;
  const plans: DataPlan[] = [];
  for (const item of items) {
    if (typeof item.variation_code !== "string" || counts.get(item.variation_code) !== 1) continue;
    if (item.fixedPrice !== "Yes" || typeof item.name !== "string") continue;
    if (voicePattern.test(item.name)) { droppedVoice += 1; continue; }
    const amountKobo = amountNairaToKobo(item.variation_amount);
    if (amountKobo === null) continue;
    const name = item.name;
    const sizeLabel = name.match(/\b\d+(?:\.\d+)?\s*(?:TB|GB|MB|KB)\b/i)?.[0]?.replace(/\s+/g, " ") ?? null;
    const { validityLabel, validityBucket } = validityFromName(name);
    plans.push({
      planId: `${serviceId}|${item.variation_code}`,
      serviceId,
      variationCode: item.variation_code,
      name,
      sizeLabel,
      validityLabel,
      validityBucket,
      kind: /sme/i.test(serviceId) || /sme/i.test(name) ? "SME" : "STANDARD",
      amountKobo,
    });
  }
  console.info("DATA_PLAN_VOICE_BUNDLES_DROPPED", serviceId, droppedVoice);
  return { plans: plans.sort((a, b) => a.amountKobo - b.amountKobo), droppedVoice, duplicateCodes };
}

async function fetchPlans(serviceId: string, provider: BillProvider) {
  const body = await provider.listPlans(serviceId);
  const parsed = parseDataPlans(serviceId, body);
  cache.set(serviceId, { plans: parsed.plans, expiresAt: Date.now() + cacheMs });
  return parsed.plans;
}

export async function getDataPlans(network: string, provider: BillProvider = vtpassProvider) {
  const services = serviceIdsForNetwork(network);
  if (!services.length) throw new AppError(404, "Data plans are unavailable for this network");
  const results = await Promise.all(services.map(async (serviceId) => {
    const cached = cache.get(serviceId);
    return cached && cached.expiresAt > Date.now() ? cached.plans : fetchPlans(serviceId, provider);
  }));
  return results.flat().sort((a, b) => a.amountKobo - b.amountKobo);
}

export async function findDataPlan(planId: string, network: string, provider: BillProvider = vtpassProvider) {
  const [serviceId, ...codeParts] = planId.split("|");
  const variationCode = codeParts.join("|");
  if (!serviceId || !variationCode || !serviceIdsForNetwork(network).includes(serviceId)) return null;
  let plans = await getDataPlans(network, provider);
  let plan = plans.find((item) => item.planId === planId);
  if (!plan) {
    await fetchPlans(serviceId, provider);
    plans = await getDataPlans(network, provider);
    plan = plans.find((item) => item.planId === planId);
  }
  return plan ?? null;
}

export function clearDataPlansCache(serviceId: string) { cache.delete(serviceId); }
export function displayNetworkName(serviceId: string) {
  if (serviceId.startsWith("mtn")) return networkNames.mtn;
  if (serviceId.startsWith("airtel")) return networkNames.airtel;
  if (serviceId.startsWith("glo")) return networkNames.glo;
  if (serviceId.startsWith("etisalat") || serviceId.startsWith("9mobile")) return networkNames.etisalat;
  return serviceId;
}
