"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { withdraw, transfer } from "@/lib/api";
import { nairaToKobo } from "@/lib/money";
import { useReference } from "./useReference";

function toKobo(amount: string) {
  const kobo = nairaToKobo(amount);
  if (kobo === null || kobo <= 0) throw new Error("Enter a valid amount");
  return kobo;
}

function useMoneyAction<V>(
  prefix: string,
  call: (v: V, reference: string) => Promise<unknown>,
) {
  const ref = useReference(prefix);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (v: V) => call(v, ref.get()),
    onSuccess: () => {
      ref.reset();
      qc.invalidateQueries({ queryKey: ["balance"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
    // on error we do NOT reset, so a retry reuses the same reference
  });

  return { ...mutation, resetReference: ref.reset };
}

export const useTransfer = () =>
  useMoneyAction<{ username: string; amount: string }>(
    "tr",
    (v, reference) => transfer(v.username, toKobo(v.amount), reference),
  );

export const useWithdraw = () =>
  useMoneyAction<{ amount: string }>("wd", (v, reference) =>
    withdraw(toKobo(v.amount), reference),
  );