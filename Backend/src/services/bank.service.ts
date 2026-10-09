import { listBanks, resolveAccount } from "../lib/paystack.js";
import { AppError } from "../lib/errors.js";

type Bank = { name: string; code: string; active: boolean; currency?: string };
let banksCache: { expiresAt: number; value: Bank[] } | undefined;

export async function getBanks() {
  if (banksCache && banksCache.expiresAt > Date.now()) return banksCache.value;
  const banks = (await listBanks()).filter((bank) => bank.active && (bank.currency === undefined || bank.currency === "NGN"));
  banksCache = { value: banks, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
  return banks;
}

export async function resolveBankAccount(accountNumber: string, bankCode: string) {
  if (!/^\d{10}$/.test(accountNumber) || !/^\d{3,6}$/.test(bankCode)) {
    throw new AppError(400, "Invalid bank account details");
  }
  return resolveAccount(accountNumber, bankCode);
}
