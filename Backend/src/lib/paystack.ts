import { createHmac, timingSafeEqual } from "node:crypto";

const BASE = "https://api.paystack.co";

function secret() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  return key;
}

async function paystackRequest<T>(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.status) {
    throw new Error(`Paystack request failed: ${json?.message ?? res.status}`);
  }
  return json.data as T;
}

export async function initializePayment(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
}) {
  return paystackRequest<{ authorization_url: string; reference: string }>(
    "/transaction/initialize",
    {
      email: input.email,
      amount: input.amountKobo,
      reference: input.reference,
      callback_url: input.callbackUrl,
    },
  );
}

export function createTransferRecipient(input: {
  name: string;
  accountNumber: string;
  bankCode: string;
}) {
  return paystackRequest<{ recipient_code: string }>("/transferrecipient", {
    type: "nuban",
    name: input.name,
    account_number: input.accountNumber,
    bank_code: input.bankCode,
    currency: "NGN",
  });
}

export function initiateTransfer(input: {
  amountKobo: bigint;
  recipientCode: string;
  reference: string;
}) {
  return paystackRequest<{ transfer_code: string }>("/transfer", {
    source: "balance",
    amount: input.amountKobo.toString(),
    recipient: input.recipientCode,
    reference: input.reference,
    reason: "Swiftbuck wallet withdrawal",
  });
}

export async function verifyTransaction(reference: string) {
  const res = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret()}` },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.status) {
    throw new Error(`Paystack verification failed: ${json?.message ?? res.status}`);
  }
  return json.data as { reference: string; amount: number; fees?: number; status: string };
}

export function isValidSignature(rawBody: Buffer, signature: string | undefined) {
  if (!signature) return false;
  const expected = createHmac("sha512", secret()).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
