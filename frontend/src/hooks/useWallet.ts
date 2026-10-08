"use client";

import { useQuery } from "@tanstack/react-query";
import { getBalance, getTransactions } from "@/lib/api";

export function useBalance() {
  return useQuery({
    queryKey: ["balance"],
    queryFn: getBalance,
    staleTime: 15_000,
    retry: (failureCount, error) =>
      failureCount < 1 && error instanceof Error && "status" in error &&
      (error as { status: number }).status === 0,
    refetchOnWindowFocus: true,
  });
}

export function useActivity() {
  return useQuery({
    queryKey: ["activity"],
    queryFn: getTransactions,
    staleTime: 30_000,
    retry: (failureCount, error) =>
      failureCount < 1 && error instanceof Error && "status" in error &&
      (error as { status: number }).status === 0,
  });
}
