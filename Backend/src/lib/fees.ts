function parseNonNegativeSafeInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a safe non-negative integer`);
  }
  return value;
}

export const PLATFORM_FEE_FLAT_KOBO = parseNonNegativeSafeInteger(
  "PLATFORM_FEE_FLAT_KOBO",
  1_000,
);
export const PLATFORM_FEE_BPS = parseNonNegativeSafeInteger("PLATFORM_FEE_BPS", 0);
export const PLATFORM_FEE_MAX_KOBO = parseNonNegativeSafeInteger(
  "PLATFORM_FEE_MAX_KOBO",
  50_000,
);
export const WITHDRAWAL_MARGIN_KOBO = parseNonNegativeSafeInteger(
  "WITHDRAWAL_MARGIN_KOBO",
  1_500,
);

function assertAmount(amountKobo: number): void {
  if (!Number.isSafeInteger(amountKobo) || amountKobo < 0) {
    throw new Error("amountKobo must be a safe non-negative integer");
  }
}

export function paystackFeeEstimateKobo(amountKobo: number): number {
  assertAmount(amountKobo);
  const percentage = Math.ceil((amountKobo * 15) / 1000);
  const flat = amountKobo >= 250_000 ? 10_000 : 0;
  return Math.min(percentage + flat, 200_000);
}

export function platformMarginKobo(amountKobo: number): number {
  assertAmount(amountKobo);
  return Math.min(
    PLATFORM_FEE_FLAT_KOBO + Math.ceil((amountKobo * PLATFORM_FEE_BPS) / 10_000),
    PLATFORM_FEE_MAX_KOBO,
  );
}

export function totalDepositFeeKobo(amountKobo: number): number {
  return paystackFeeEstimateKobo(amountKobo) + platformMarginKobo(amountKobo);
}

export function creditKobo(amountKobo: number): number {
  return amountKobo - totalDepositFeeKobo(amountKobo);
}

export function paystackTransferCostKobo(amountKobo: number): number {
  assertAmount(amountKobo);
  if (amountKobo <= 500_000) return 1_000;
  if (amountKobo <= 5_000_000) return 2_500;
  return 5_000;
}

export function stampDutyKobo(amountKobo: number): number {
  assertAmount(amountKobo);
  return amountKobo >= 1_000_000 ? 5_000 : 0;
}

export function withdrawalFeeKobo(amountKobo: number): number {
  return paystackTransferCostKobo(amountKobo) + stampDutyKobo(amountKobo) + WITHDRAWAL_MARGIN_KOBO;
}
