"use client";

import { useQuery } from "@tanstack/react-query";
import { getMockActivity, getMockBalance } from "@/lib/mock";

export function useBalance(userId: number) {
  return useQuery({
    queryKey: ["wallet", userId, "balance"],
    queryFn: getMockBalance,
  });
}

export function useActivity(userId: number) {
  return useQuery({
    queryKey: ["wallet", userId, "activity"],
    queryFn: getMockActivity,
  });
}
