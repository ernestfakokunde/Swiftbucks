import { createHmac, timingSafeEqual } from "node:crypto";

const BASE = "https://api.paystack.co";

export class PaystackError extends Error {
  constructor(
    message: string,
    public readonly definite: boolean,
  ) {
    super(message);
    this.name = "PaystackError";
  }
}

function secret() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  return key;
}

async function paystackRequest<T>(path: string, body: Record<string, unknown>) {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new PaystackError(
      `Paystack request failed: ${error instanceof Error ? error.message : "network error"}`,
      false,
    );
  }

  let json: { status?: boolean; message?: string; data?: T } | null;
  try {
    json = await res.json() as { status?: boolean; message?: string; data?: T };
  } catch {
    throw new PaystackError("Paystack returned an unreadable response", false);
  }
  if (res.status >= 500) {
    throw new PaystackError(`Paystack request failed: ${json.message ?? res.status}`, false);
  }
  if (!res.ok || !json.status) {
    throw new PaystackError(`Paystack request failed: ${json.message ?? res.status}`, true);
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
  const amount = Number(input.amountKobo);
  if (!Number.isSafeInteger(amount)) {
    throw new PaystackError("Transfer amount is outside the safe integer range", true);
  }
  return paystackRequest<{ transfer_code: string; status?: string }>("/transfer", {
    source: "balance",
    amount,
    recipient: input.recipientCode,
    reference: input.reference,
    reason: "Swiftbuck wallet withdrawal",
  });
}

export async function verifyTransaction(reference: string) {
  const data = await paystackGet<{
    reference: string;
    amount: number;
    fees?: number | undefined;
    currency: string;
    status: string;
  }>(`/transaction/verify/${encodeURIComponent(reference)}`);
  return data;
}

export async function verifyTransfer(transferCode: string) {
  return paystackGet<{
    transfer_code: string;
    reference: string;
    amount: number;
    currency: string;
    status: string;
    fees?: number;
  }>(`/transfer/${encodeURIComponent(transferCode)}`);
}

export async function listBanks() {
  return paystackGet<Array<{ name: string; code: string; active: boolean; currency?: string }>>(
    "/bank?currency=NGN&perPage=100",
  );
}

export async function resolveAccount(accountNumber: string, bankCode: string) {
  return paystackGet<{ account_number: string; account_name: string; bank_id: number }>(
    `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
  );
}

async function paystackGet<T>(path: string) {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${secret()}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new PaystackError(
      `Paystack request failed: ${error instanceof Error ? error.message : "network error"}`,
      false,
    );
  }
  let json: { status?: boolean; message?: string; data?: T } | null;
  try {
    json = await res.json() as { status?: boolean; message?: string; data?: T };
  } catch {
    throw new PaystackError("Paystack returned an unreadable response", false);
  }
  if (res.status >= 500) {
    throw new PaystackError(`Paystack request failed: ${json.message ?? res.status}`, false);
  }
  if (!res.ok || !json.status) {
    throw new PaystackError(`Paystack request failed: ${json.message ?? res.status}`, true);
  }
  return json.data as T;
}

export function isValidSignature(rawBody: Buffer, signature: string | undefined) {
  if (!signature) return false;
  const expected = createHmac("sha512", secret()).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
