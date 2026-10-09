"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAirtimeNetworks, getBillPurchase, purchaseAirtime, type AirtimeNetwork } from "@/lib/api";
import { useReference } from "./useReference";

const fallback: AirtimeNetwork[] = [
  { id: "mtn", name: "MTN" }, { id: "airtel", name: "Airtel" },
  { id: "glo", name: "Glo" }, { id: "etisalat", name: "9mobile" },
];

export function useAirtimeNetworks() {
  const query = useQuery({ queryKey: ["bills", "airtime", "networks"], queryFn: getAirtimeNetworks, staleTime: 60 * 60 * 1000 });
  return { ...query, data: query.data ?? fallback };
}

export function useAirtimePurchase(fingerprint: string) {
  const reference = useReference("airtime", fingerprint);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: { network: string; phone: string; amountKobo: number }) =>
      purchaseAirtime({ ...input, idempotencyKey: reference.get() }),
    onSuccess: (purchase) => {
      if (purchase.status === "DELIVERED") reference.reset();
      void client.invalidateQueries({ queryKey: ["balance"] });
      void client.invalidateQueries({ queryKey: ["activity"] });
      void client.invalidateQueries({ queryKey: ["bills"] });
    },
  });
  return { ...mutation, reference };
}

export function useBillPurchase(id: number | null, poll: boolean) {
  return useQuery({
    queryKey: ["bills", "purchase", id],
    queryFn: () => getBillPurchase(id!),
    enabled: id !== null,
    refetchInterval: poll ? 3000 : false,
    refetchIntervalInBackground: false,
    retry: (count, error) => count < 2 && "status" in error && error.status === 0,
  });
}
