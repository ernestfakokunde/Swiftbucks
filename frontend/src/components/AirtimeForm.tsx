"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWatch, useForm } from "react-hook-form";
import { useBalance } from "@/hooks/useWallet";
import { useAirtimeNetworks, useAirtimePurchase, useBillPurchase } from "@/hooks/useBills";
import { ApiError } from "@/lib/api";
import { formatNaira, nairaToKobo } from "@/lib/money";
import { FlowConfirm, type SummaryRow } from "./FlowConfirm";
import { Button } from "./Button";
import { Loader } from "./Loader";
import { NetworkPicker } from "./NetworkPicker";
import { PhoneField, validNigerianPhone } from "./PhoneField";

type Values = { network: string; phone: string; amount: string };
const MIN = 5_000;
const MAX = 1_000_000;

export function AirtimeForm() {
  const router = useRouter();
  const balance = useBalance();
  const networks = useAirtimeNetworks();
  const form = useForm<Values>({ defaultValues: { network: "", phone: "", amount: "" } });
  const watched = useWatch({ control: form.control });
  const amountKobo = nairaToKobo(watched.amount ?? "");
  const fingerprint = `${watched.network ?? ""}|${watched.phone ?? ""}|${amountKobo ?? ""}`;
  const purchase = useAirtimePurchase(fingerprint);
  const [step, setStep] = useState<"form" | "confirm" | "processing" | "done" | "failed">("form");
  const [purchaseId, setPurchaseId] = useState<number | null>(null);
  const [finalPurchase, setFinalPurchase] = useState<{ status: string; phone: string; amountKobo: string; reference: string } | null>(null);
  const polling = useBillPurchase(purchaseId, step === "processing");
  const selected = networks.data.find((network) => network.id === watched.network);
  const overBalance = amountKobo !== null && balance.data !== undefined && BigInt(amountKobo) > BigInt(balance.data.balanceKobo);

  useEffect(() => {
    if (step !== "processing") return;
    const timer = window.setTimeout(() => setStep("failed"), 90_000);
    return () => window.clearTimeout(timer);
  }, [step]);
  useEffect(() => {
    const last = localStorage.getItem("swiftbuck-last-network");
    if (last && networks.data.some((item) => item.id === last)) form.setValue("network", last);
  }, [form, networks.data]);

  if (step === "confirm") {
    const rows: SummaryRow[] = [
      { label: "Network", value: selected?.name ?? "" },
      { label: "Phone number", value: watched.phone ?? "" },
      { label: "Amount", value: formatNaira(amountKobo ?? 0) },
      { label: "Fee", value: "₦0.00" },
      { label: "From", value: "Your wallet" },
      { label: "Balance after", value: formatNaira((BigInt(balance.data?.balanceKobo ?? "0") - BigInt(amountKobo ?? 0)).toString()) },
    ];
    return <FlowConfirm amountKobo={amountKobo ?? 0} rows={rows} submitLabel="Buy" onConfirm={() => purchase.mutate({ network: watched.network!, phone: watched.phone!, amountKobo: amountKobo! }, { onSuccess: (result) => { setPurchaseId(result.id); setFinalPurchase(result); setStep(result.status === "DELIVERED" ? "done" : result.status === "PENDING" ? "processing" : "failed"); } })} onEdit={() => { purchase.reset(); setStep("form"); }} isSubmitting={purchase.isPending} error={purchase.error instanceof ApiError ? purchase.error.message : purchase.error instanceof Error ? purchase.error.message : null} />;
  }
  const resolvedPurchase = polling.data?.status !== "PENDING" ? polling.data ?? finalPurchase : finalPurchase;
  const resolvedStep = polling.data?.status === "DELIVERED" ? "done" : polling.data && polling.data.status !== "PENDING" ? "failed" : step;
  if (resolvedStep === "done" && resolvedPurchase) return <Result title={`${formatNaira(resolvedPurchase.amountKobo)} airtime sent`} detail={`to ${resolvedPurchase.phone}`} reference={resolvedPurchase.reference} onDone={() => router.push("/")} />;
  if (resolvedStep === "failed") return <Result title="Couldn't complete this purchase" detail={resolvedPurchase?.status === "REVERSED" ? "Your money was returned to your wallet" : "Please try again"} onDone={() => setStep("form")} />;
  if (step === "processing") return <div className="flex flex-1 flex-col items-center justify-center text-center"><Loader /><h1 className="mt-4 font-display text-xl font-bold" aria-live="polite">Processing</h1><p className="mt-2 text-sm text-muted">This usually takes under a minute</p><p className="mt-5 text-xs text-muted">Still processing. We will update your activity</p><Button className="mt-5" onClick={() => router.push("/")}>Home</Button></div>;

  const canContinue = Boolean(selected && validNigerianPhone(watched.phone ?? "") && amountKobo !== null && amountKobo >= MIN && amountKobo <= MAX && !overBalance);
  return (
    <form className="flex flex-1 flex-col" onSubmit={form.handleSubmit(() => setStep("confirm"))}>
      <button type="button" onClick={() => router.push("/")} aria-label="Back to home" className="grid h-11 w-11 place-items-center rounded-full border border-deep-soft bg-deep-soft text-lg text-white">←</button>
      <h1 className="mt-4 font-display text-xl font-bold">Buy airtime</h1>
      <p className="mt-1 text-[13px] text-muted">Available {formatNaira(balance.data?.balanceKobo ?? "0")}</p>
      <label className="mt-5 text-[13px] text-muted">Network</label>
      <NetworkPicker networks={networks.data} value={watched.network ?? ""} onChange={(value) => form.setValue("network", value)} />
      <PhoneField id="airtime-phone" value={watched.phone ?? ""} onChange={(value) => form.setValue("phone", value)} />
      <label htmlFor="airtime-amount" className="mt-5 text-[13px] text-muted">Amount</label>
      <input id="airtime-amount" inputMode="decimal" value={watched.amount} onChange={(event) => form.setValue("amount", event.target.value.replace(/[^\d.]/g, ""))} className="mt-2 rounded-2xl border border-line bg-bg px-4 py-3 text-center font-display text-3xl font-bold tabular-nums outline-none focus:border-orange" />
      <div className="mt-3 grid grid-cols-3 gap-2">{[100, 200, 500, 1000, 2000, 5000].map((value) => <button type="button" key={value} onClick={() => form.setValue("amount", String(value))} className="rounded-xl border border-line px-2 py-2 text-sm">₦{value.toLocaleString()}</button>)}</div>
      <p className="mt-2 text-xs text-muted">Minimum {formatNaira(MIN)} · Maximum {formatNaira(MAX)}</p>
      {overBalance ? <p className="mt-2 text-xs text-red" role="alert">You only have {formatNaira(balance.data?.balanceKobo ?? "0")} available.</p> : null}
      <p className="mt-4 text-center text-sm text-muted">You pay <strong className="text-text">{formatNaira(amountKobo ?? 0)}</strong> · Fee ₦0.00</p>
      <div className="mt-auto pt-5"><Button type="submit" disabled={!canContinue}>Continue</Button></div>
    </form>
  );
}

function Result({ title, detail, reference, onDone }: { title: string; detail: string; reference?: string; onDone: () => void }) {
  return <div className="flex flex-1 flex-col items-center justify-center text-center"><span className="grid h-16 w-16 place-items-center rounded-full bg-orange text-3xl text-white">✓</span><h1 className="mt-5 font-display text-xl font-bold">{title}</h1><p className="mt-2 text-sm text-muted">{detail}</p>{reference ? <p className="mt-4 text-xs text-muted">Reference {reference}</p> : null}<Button className="mt-8" onClick={onDone}>Done</Button></div>;
}
