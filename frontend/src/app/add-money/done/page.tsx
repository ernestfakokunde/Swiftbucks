"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { getDepositStatus, ApiError } from "@/lib/api";
import { LayoutShell } from "@/components/LayoutShell";
import { Loader } from "@/components/Loader";
import { Button } from "@/components/Button";

function DoneContent() {
  const search = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [hidden, setHidden] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const reference = search.get("reference") ?? search.get("trxref") ?? (typeof window !== "undefined" ? sessionStorage.getItem("swiftbuck-deposit-reference") : null);
  const status = useQuery({
    queryKey: ["deposit-status", reference],
    queryFn: () => getDepositStatus(reference as string),
    enabled: Boolean(reference) && !hidden && !timedOut,
    refetchInterval: (query) => query.state.data?.status === "PENDING" ? 2_000 : false,
    retry: false,
  });
  useEffect(() => {
    if (status.data?.status === "SUCCESS") {
      sessionStorage.removeItem("swiftbuck-deposit-reference");
      void queryClient.invalidateQueries({ queryKey: ["balance"] });
      void queryClient.invalidateQueries({ queryKey: ["activity"] });
    }
  }, [queryClient, status.data?.status]);
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    if (!reference || status.data?.status !== undefined) return;
    const timer = window.setTimeout(() => setTimedOut(true), 60_000);
    return () => window.clearTimeout(timer);
  }, [reference, status.data?.status]);
  const message = !reference ? "Payment reference not found." :
    status.error instanceof ApiError && status.error.status === 404 ? "Payment not found." :
    timedOut ? "Still processing. Your balance will update when the payment is confirmed." :
    status.error ? status.error.message :
    status.data?.status === "SUCCESS" ? "Payment added to your wallet." :
    status.data?.status === "MISMATCH" ? "We couldn't confirm this payment. Contact support." :
    "Waiting for confirmation";
  return <LayoutShell><div className="flex min-h-[560px] flex-col items-center justify-center text-center"><Loader /><h1 className="mt-5 font-display text-xl font-bold">{message}</h1><p className="mt-2 text-sm text-muted">We only mark the payment complete after Paystack confirms it.</p><Button className="mt-6" type="button" onClick={() => router.push("/")}>Home</Button></div></LayoutShell>;
}

export default function DepositDonePage() {
  return <Suspense fallback={<Loader />}><DoneContent /></Suspense>;
}
