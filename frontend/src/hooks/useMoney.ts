"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deposit, withdraw, transfer } from "@/lib/api";
import { nairaToKobo } from "@/lib/money";
import { useUser } from "@/context/UserContext";
import { useReference } from "./useReference";

function toKobo(amount: string) {
  const kobo = nairaToKobo(amount);
  if (kobo === null || kobo <= 0) throw new Error("Enter a valid amount");
  return kobo;
}

function useMoneyAction<V>(
  prefix: string,
  call: (userId: number, v: V, reference: string) => Promise<unknown>
) {
  const { userId } = useUser();
  const ref = useReference(prefix);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (v: V) => call(userId, v, ref.get()),
    onSuccess: () => {
      ref.reset(); // next attempt gets a fresh reference
      qc.invalidateQueries({ queryKey: ["balance", userId] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
    // on error we do NOT reset, so a retry reuses the same reference
  });

  return { ...mutation, resetReference: ref.reset };
}

export const useTransfer = () =>
  useMoneyAction<{ username: string; amount: string }>(
    "tr",
    (userId, v, reference) =>
      transfer(userId, v.username, toKobo(v.amount), reference)
  );

export const useDeposit = () =>
  useMoneyAction<{ amount: string }>("dep", (userId, v, reference) =>
    deposit(userId, toKobo(v.amount), reference)
  );

export const useWithdraw = () =>
  useMoneyAction<{ amount: string }>("wd", (userId, v, reference) =>
    withdraw(userId, toKobo(v.amount), reference)
  );