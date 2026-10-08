// Turns what the user typed ("2,000.50") into whole kobo (200050).
// Returns null if the text isn't a valid naira amount.
export function nairaToKobo(input: string): number | null {
  const clean = input.replace(/,/g, "").trim();

  // digits, optionally followed by a dot and 1 or 2 digits
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;

  const [naira, kobo = ""] = clean.split(".");
  const total = BigInt(naira) * BigInt(100) + BigInt(kobo.padEnd(2, "0"));
  return total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null;
}

// Turns kobo from the API ("200050") into display text ("₦2,000.50").
export function formatNaira(kobo: string | number): string {
  const value = BigInt(kobo);
  const negative = value < BigInt(0);
  const abs = negative ? -value : value;

  const naira = abs / BigInt(100);
  const rest = (abs % BigInt(100)).toString().padStart(2, "0");

  return `${negative ? "-" : ""}₦${naira.toLocaleString("en-NG")}.${rest}`;
}