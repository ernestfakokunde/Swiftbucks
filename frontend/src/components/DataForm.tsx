"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useBalance } from "@/hooks/useWallet";
import { useQueryClient } from "@tanstack/react-query";
import { useBillPurchase, useDataNetworks, useDataPlans, useDataPurchase } from "@/hooks/useBills";
import { ApiError, type DataPlan } from "@/lib/api";
import { formatNaira } from "@/lib/money";
import { NetworkPicker } from "./NetworkPicker";
import { PhoneField, validNigerianPhone } from "./PhoneField";
import { FlowConfirm, type SummaryRow } from "./FlowConfirm";
import { FlowResult } from "./FlowResult";
import { Button } from "./Button";
import { Loader } from "./Loader";

type Step = "form" | "confirm" | "processing" | "done" | "failed";
const buckets = [
  ["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"], ["longterm", "Long term"],
] as const;

export function DataForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const balance = useBalance();
  const networks = useDataNetworks();
  const [networkSelection, setNetwork] = useState("");
  const [phone, setPhone] = useState("");
  const [planId, setPlanId] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [purchaseId, setPurchaseId] = useState<number | null>(null);
  const [purchase, setPurchase] = useState<Awaited<ReturnType<typeof import("@/lib/api").getBillPurchase>> | null>(null);
  const [bucket, setBucket] = useState("all");
  const [search, setSearch] = useState("");
  const [priceChange, setPriceChange] = useState<{ planId: string; amountKobo: number } | null>(null);
  const [localError, setLocalError] = useState("");
  const [timedOut, setTimedOut] = useState(false);
  const network = networkSelection || networks.data?.[0]?.id || "";
  const plansQuery = useDataPlans(network);
  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data]);
  const selectedPlan = plans.find((plan) => plan.planId === planId);
  const selectedAmount = selectedPlan && priceChange?.planId === planId ? priceChange.amountKobo : selectedPlan?.amountKobo;
  const fingerprint = `${network}|${phone}|${planId}`;
  const mutation = useDataPurchase(fingerprint);
  const polling = useBillPurchase(purchaseId, step === "processing" && !timedOut);
  const overBalance = selectedAmount !== undefined && balance.data !== undefined && BigInt(selectedAmount) > BigInt(balance.data.balanceKobo);

  useEffect(() => {
    if (step !== "processing") return;
    const timer = window.setTimeout(() => { setTimedOut(true); setLocalError("This is taking longer than expected. Your transaction is still being checked; check Activity for updates."); }, 90_000);
    return () => window.clearTimeout(timer);
  }, [step]);

  const finalPurchase = polling.data && polling.data.status !== "PENDING" ? polling.data : purchase;
  const resolvedStep = polling.data?.status === "DELIVERED" ? "done" : polling.data && polling.data.status !== "PENDING" ? "failed" : step;
  useEffect(() => {
    if (resolvedStep !== "done" && resolvedStep !== "failed") return;
    void queryClient.invalidateQueries({ queryKey: ["balance"] });
    void queryClient.invalidateQueries({ queryKey: ["activity"] });
    void queryClient.invalidateQueries({ queryKey: ["bills"] });
  }, [queryClient, resolvedStep]);

  const tabs = useMemo(() => [
    ["all", "All"] as const,
    ...buckets.filter(([key]) => plans.some((plan) => plan.validityBucket === key)),
  ], [plans]);
  const visible = plans.filter((plan) => (bucket === "all" || plan.validityBucket === bucket)
    && `${plan.name} ${plan.sizeLabel ?? ""} ${plan.validityLabel ?? ""} ${plan.kind}`.toLowerCase().includes(search.toLowerCase()));
  const standard = visible.filter((plan) => plan.kind !== "SME");
  const sme = visible.filter((plan) => plan.kind === "SME");
  const priceFor = (plan: DataPlan) => priceChange?.planId === plan.planId ? priceChange.amountKobo : plan.amountKobo;

  if (step === "confirm" && selectedPlan && selectedAmount !== undefined) {
    const rows: SummaryRow[] = [
      { label: "Network", value: networks.data?.find((item) => item.id === network)?.name ?? network },
      { label: "Phone", value: phone },
      { label: "Plan", value: `${selectedPlan.name}${selectedPlan.kind === "SME" ? " · SME" : ""}` },
      { label: "Price", value: formatNaira(selectedAmount) },
      { label: "Fee", value: "₦0.00" },
      { label: "Balance after", value: formatNaira((BigInt(balance.data?.balanceKobo ?? "0") - BigInt(selectedAmount)).toString()) },
    ];
    return <FlowConfirm amountKobo={selectedAmount} rows={rows} submitLabel={`Buy ${selectedPlan.sizeLabel ?? "plan"}`} onConfirm={() => {
      setLocalError("");
      mutation.mutate({ network, phone, planId: selectedPlan.planId, expectedAmountKobo: selectedAmount }, {
        onSuccess: (result) => { setPurchase(result); setPurchaseId(result.id); setStep(result.status === "DELIVERED" ? "done" : result.status === "PENDING" ? "processing" : "failed"); },
        onError: (error) => {
          if (error instanceof ApiError && error.status === 409 && error.message === "Price changed" && typeof error.data?.amountKobo === "number") {
            mutation.reset();
            setPriceChange({ planId: selectedPlan.planId, amountKobo: error.data.amountKobo });
            setBucket("all"); setSearch(""); setLocalError(`The price changed to ${formatNaira(error.data.amountKobo)}. Review it and confirm again.`); setStep("form"); return;
          }
          if (error instanceof ApiError && error.status === 409 && error.message === "Plan no longer available") {
            mutation.reset();
            void plansQuery.refetch(); setLocalError("That plan is no longer available. The plan list has been refreshed."); setStep("form"); return;
          }
        },
      });
    }} onEdit={() => setStep("form")} isSubmitting={mutation.isPending} error={mutation.error instanceof Error ? mutation.error.message : null} />;
  }

  if (resolvedStep === "processing") return <div className="flex flex-1 flex-col items-center justify-center text-center"><Loader /><h1 className="mt-4 font-display text-xl font-bold" aria-live="polite">Processing your data purchase</h1><p className="mt-2 text-sm text-muted" aria-live="polite">We’re checking the provider’s response. We’ll update your activity when it’s final.</p>{localError ? <p className="mt-4 text-sm text-orange" role="status">{localError}</p> : null}<Button className="mt-5" onClick={() => router.push("/activity")}>View activity</Button></div>;

  if (resolvedStep === "done" && finalPurchase) return <FlowResult amountKobo={Number(finalPurchase.amountKobo)} line={`${finalPurchase.planName ?? "Data bundle"} sent to ${finalPurchase.phone}`} onDone={() => router.push("/")} status="Completed" />;
  if (resolvedStep === "failed" && finalPurchase) return <FlowResult amountKobo={Number(finalPurchase.amountKobo)} line={finalPurchase.status === "REVERSED" ? "Your money was returned to your wallet." : "The purchase could not be completed. Check Activity for the latest status."} onDone={() => router.push("/")} status={finalPurchase.status === "REVERSED" ? "Reversed" : "Failed"} />;

  const canContinue = Boolean(network && validNigerianPhone(phone) && selectedPlan && selectedAmount !== undefined && !overBalance);
  return <div className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col">
    <header className="mb-5 flex items-center gap-3 sm:mb-7">
      <button type="button" onClick={() => router.push("/")} aria-label="Back to home" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-deep text-lg text-white transition-colors hover:bg-deep-soft">←</button>
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-xl font-bold sm:text-2xl">Buy data</h1>
        <p className="mt-0.5 text-xs text-muted">Choose a bundle and send it instantly.</p>
      </div>
      <div className="shrink-0 rounded-xl bg-surface px-3 py-2 text-right shadow-sm sm:px-4">
        <span className="block text-[10px] text-muted sm:text-xs">Available balance</span>
        <strong className="font-display text-xs tabular-nums sm:text-sm">{formatNaira(balance.data?.balanceKobo ?? "0")}</strong>
      </div>
    </header>

    <div className="grid flex-1 content-start gap-4 lg:grid-cols-[minmax(260px,0.72fr)_minmax(0,1.5fr)] lg:gap-6">
      <section className="h-fit rounded-[22px] border border-line bg-surface p-4 shadow-sm sm:p-5">
        <h2 className="mb-4 font-display text-sm font-bold">Recipient</h2>
        <label className="text-xs text-muted">Network</label>
        {networks.isError ? <div className="mt-2 text-sm text-red" role="alert">Could not load networks. <button type="button" className="underline" onClick={() => void networks.refetch()}>Retry</button></div> : <NetworkPicker networks={networks.data ?? []} value={network} onChange={(value) => { setNetwork(value); setPlanId(""); setPriceChange(null); setLocalError(""); }} storageKey="swiftbuck-last-data-network" />}
        {!networks.isLoading && !networks.isError && networks.data?.length === 0 ? <p className="mt-3 text-sm text-muted" role="status">Data bundles are not currently available from VTpass.</p> : null}
        <PhoneField id="data-phone" value={phone} onChange={setPhone} />
        <div className="mt-5 rounded-xl bg-bg p-3 text-xs leading-5 text-muted">Data plans are loaded directly from the available VTpass services. Standard and SME plans are shown separately.</div>
        {overBalance ? <p className="mt-3 text-xs text-red" role="alert">You don’t have enough balance for this plan.</p> : null}
        {localError && step === "form" ? <p className="mt-3 text-sm text-orange" role="alert">{localError}</p> : null}
        {selectedAmount !== undefined ? <div className="mt-4 flex items-center justify-between rounded-xl border border-line px-3 py-3 text-sm"><span className="text-muted">You pay</span><strong className="font-display tabular-nums">{formatNaira(selectedAmount)}</strong></div> : null}
      </section>

      <section className="min-w-0 rounded-[22px] border border-line bg-surface p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="font-display text-sm font-bold">Choose a bundle</h2><p className="mt-1 text-xs text-muted">Tap a card to select your plan.</p></div>
          <span className="shrink-0 rounded-full bg-bg px-3 py-1 text-[11px] font-medium text-muted">{visible.length} plans</span>
        </div>
        {plansQuery.isLoading ? <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-[92px] animate-pulse rounded-2xl bg-bg" />)}</div> : null}
        {plansQuery.isError ? <div className="mt-3 rounded-2xl bg-bg p-4 text-sm" role="alert">We couldn’t load plans for this network. <button type="button" className="ml-1 font-semibold text-orange underline" onClick={() => void plansQuery.refetch()}>Retry</button></div> : null}
        {!plansQuery.isLoading && !plansQuery.isError && plans.length ? <>
          <div role="tablist" aria-label="Plan validity" className="mt-4 flex gap-1 overflow-x-auto rounded-xl bg-bg p-1">{tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={bucket === key} onClick={() => setBucket(key)} className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-medium transition-colors ${bucket === key ? "bg-surface text-orange shadow-sm" : "text-muted hover:text-text"}`}>{label}</button>)}</div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search data plans" placeholder="Search by bundle size or validity" className="mt-2 min-h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-orange" />
          <div className="mt-3 max-h-[min(52vh,540px)] space-y-4 overflow-y-auto overscroll-contain pr-1">
            {([ ["Standard", standard], ["SME", sme] ] as const).map(([heading, group]) => group.length ? <section key={heading} aria-label={`${heading} bundles`}>
              <div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{heading} bundles</h3><span className="text-[10px] text-muted">{group.length} plans</span></div>
              <div role="radiogroup" aria-label={`${heading} bundles`} className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">{group.map((plan) => <button key={plan.planId} type="button" role="radio" aria-checked={planId === plan.planId} onClick={() => { setPlanId(plan.planId); setLocalError(""); }} className={`relative flex min-h-[88px] flex-col items-start justify-between rounded-2xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${planId === plan.planId ? "border-orange bg-orange/5 ring-1 ring-orange/30" : "border-line bg-white hover:border-orange/40"}`}>
                <span className="block w-full truncate pr-4 font-display text-sm font-bold">{plan.sizeLabel ?? plan.name}</span>
                <span className="block w-full truncate text-[11px] text-muted">{plan.validityLabel ?? plan.name}</span>
                <strong className="font-display text-sm tabular-nums">{formatNaira(priceFor(plan))}</strong>
                {planId === plan.planId ? <span aria-hidden="true" className="absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full bg-orange text-[10px] font-bold text-white">✓</span> : null}
              </button>)}</div>
            </section> : null)}
            {!visible.length ? <p className="py-8 text-center text-sm text-muted">No plans match your search.</p> : null}
          </div>
        </> : null}
      </section>
    </div>
    <div className="mx-auto mt-4 w-full max-w-[440px] lg:ml-auto lg:mr-0 lg:max-w-[300px]">
      <Button type="button" disabled={!canContinue} onClick={() => setStep("confirm")}>Continue</Button>
    </div>
  </div>;
}
