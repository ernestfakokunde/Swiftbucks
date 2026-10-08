import { createHmac, timingSafeEqual } from "node:crypto";

const BASE = "https://api.paystack.co";

function secret() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  return key;
}

export async function initializePayment(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
}) {
  const res = await fetch(`${BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo,
      reference: input.reference,
      callback_url: input.callbackUrl,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.status) {
    throw new Error(`Paystack initialize failed: ${json?.message ?? res.status}`);
  }
  return json.data as { authorization_url: string; reference: string };
}

// Was this webhook really signed by Paystack?
export function isValidSignature(rawBody: Buffer, signature: string | undefined) {
  if (!signature) return false;
  const expected = createHmac("sha512", secret()).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b); // throws on unequal lengths, hence the check
}