"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";
import { formatNaira, nairaToKobo } from "@/lib/money";
import { ApiError, getBanks, getDepositQuote, getWithdrawalQuote, initializeDeposit, lookupUser, resolveBankAccount, transfer, withdraw, type DepositQuote, type WithdrawalQuote } from "@/lib/api";
import { useBalance } from "@/hooks/useWallet";
import { useReference } from "@/hooks/useReference";
import { FlowConfirm, type SummaryRow } from "./FlowConfirm";
import { FlowResult } from "./FlowResult";
import { Button } from "./Button";
import { useAuth } from "@/context/AuthContext";

type FlowMode = "send" | "add" | "withdraw";
type Values = { username: string; amount: string; bank: string; accountNumber: string; accountName: string };

export function FlowForm({ mode }: { mode: FlowMode }) {
  const router = useRouter();
  const { user } = useAuth();
  const balance = useBalance();
  const reference = useReference(mode);
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [submitted, setSubmitted] = useState<Values | null>(null);
  const [amountKobo, setAmountKobo] = useState(0);
  const form = useForm<Values>({
    defaultValues: { username: "", amount: "", bank: "", accountNumber: "", accountName: "" },
  });
  const watched = useWatch({ control: form.control });
  const username = (watched.username ?? "").replace(/^@/, "").toLowerCase();
  const amountText = watched.amount ?? "";
  const amount = useMemo(() => nairaToKobo(amountText), [amountText]);
  const isSend = mode === "send";
  const isAdd = mode === "add";
  const isWithdraw = mode === "withdraw";
  const [debouncedUsername, setDebouncedUsername] = useState("");
  const [debouncedAmountKobo, setDebouncedAmountKobo] = useState<number | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedAmountKobo(amount ?? null), 350);
    return () => window.clearTimeout(timer);
  }, [amount]);
  const quote = useQuery<DepositQuote | WithdrawalQuote>({
    queryKey: [isAdd ? "deposit-quote" : "withdrawal-quote", debouncedAmountKobo],
    queryFn: () => isAdd
      ? getDepositQuote(debouncedAmountKobo!)
      : getWithdrawalQuote(debouncedAmountKobo!),
    enabled: (isAdd || isWithdraw) && debouncedAmountKobo !== null && debouncedAmountKobo >= 50_000,
    retry: false,
  });
  const banksQuery = useQuery({ queryKey: ["banks"], queryFn: getBanks, staleTime: 24 * 60 * 60 * 1000, enabled: isWithdraw });
  const accountNumber = watched.accountNumber ?? "";
  const resolveQuery = useQuery({
    queryKey: ["bank-account", watched.bank, accountNumber],
    queryFn: () => resolveBankAccount(accountNumber, watched.bank ?? ""),
    enabled: isWithdraw && /^\d{10}$/.test(accountNumber) && Boolean(watched.bank),
    retry: false,
  });

  useEffect(() => {
    reference.reset();
  }, [reference, username, amountText, watched.bank, watched.accountNumber, watched.accountName]);

  useEffect(() => {
    if (!isSend) return;
    const timer = window.setTimeout(() => setDebouncedUsername(username), 400);
    return () => window.clearTimeout(timer);
  }, [isSend, username]);

  const lookup = useQuery({
    queryKey: ["username", debouncedUsername],
    queryFn: () => lookupUser(debouncedUsername),
    enabled: isSend && /^[a-z0-9_]{3,20}$/.test(debouncedUsername),
    retry: false,
  });
  const overBalance =
    !isAdd && amount !== null && balance.data !== undefined &&
    BigInt(amount) > BigInt(balance.data.balanceKobo);
  const ownUsername = isSend && username === user?.username.toLowerCase();
  const mutation = useMutation({
    mutationFn: async () => {
      if (amount === null) throw new Error("Enter a valid amount");
      if (isSend) return transfer(username, amount, reference.get());
      if (isWithdraw) return withdraw(amount, reference.get(), submitted?.bank ?? "", submitted?.accountNumber ?? "", banksQuery.data?.find((bank) => bank.code === submitted?.bank)?.name ?? "", submitted?.accountName ?? "");
      const result = await initializeDeposit(amount);
      const url = new URL(result.authorizationUrl);
      if (url.protocol !== "https:" || (url.hostname !== "paystack.com" && !url.hostname.endsWith(".paystack.com"))) {
        throw new Error("Payment provider returned an invalid checkout URL.");
      }
      sessionStorage.setItem("swiftbuck-deposit-reference", result.reference);
      window.location.href = url.toString();
      return result;
    },
    onSuccess: () => {
      if (!isAdd) {
        reference.reset();
        setStep("done");
      }
    },
  });
  const quoteData = quote.data;
  const depositQuoteData = quoteData && "creditKobo" in quoteData ? quoteData : null;
  const withdrawalQuoteData = quoteData && "totalDebitKobo" in quoteData ? quoteData : null;
  const quotedTotal = withdrawalQuoteData?.totalDebitKobo ?? null;
  const quoteReady = quoteData !== undefined && debouncedAmountKobo === amount;

  if (step === "confirm" && submitted) {
    const rows: SummaryRow[] = isSend
      ? [
          { label: "To", value: `${lookup.data?.displayName} (@${lookup.data?.username})` },
          { label: "Fee", value: "₦0.00" },
          { label: "Balance after", value: formatNaira((BigInt(balance.data?.balanceKobo ?? "0") - BigInt(amountKobo)).toString()) },
        ]
      : isAdd
        ? [{ label: "Pay with", value: "Card or bank transfer" }, { label: "Powered by", value: "Paystack" }]
        : [
            { label: "To", value: `${banksQuery.data?.find((bank) => bank.code === submitted.bank)?.name ?? "Bank"} · ${submitted.accountNumber}` },
            { label: "Account name", value: submitted.accountName },
            { label: "Fee", value: withdrawalQuoteData ? formatNaira(String(withdrawalQuoteData.feeKobo)) : "—" },
          ];
    return (
      <FlowConfirm
        amountKobo={amountKobo}
        rows={rows}
        submitLabel={isSend ? "Send" : isAdd ? "Pay with Paystack" : "Withdraw"}
        onConfirm={() => mutation.mutate()}
        onEdit={() => { mutation.reset(); setStep("form"); }}
        isSubmitting={mutation.isPending}
        error={mutation.error instanceof Error ? mutation.error.message : null}
      />
    );
  }

  if (step === "done") {
    return (
      <FlowResult
        amountKobo={amountKobo}
        line={isSend ? `Sent to ${lookup.data?.displayName ?? "your contact"}` : "is on its way to your bank"}
        invite={isSend}
        status={isWithdraw ? "Processing" : "Completed"}
        onDone={() => router.push("/")}
      />
    );
  }

  const validRecipient = !isSend || (lookup.data !== undefined && debouncedUsername === username && !ownUsername);
  const withdrawalReady = !isWithdraw || (resolveQuery.data !== undefined && watched.accountName === resolveQuery.data.account_name);
  const canReview = amount !== null && amount >= (isAdd || isWithdraw ? 50_000 : 100) &&
    !overBalance && (quotedTotal === null || quotedTotal <= Number(balance.data?.balanceKobo ?? "0")) &&
    validRecipient && withdrawalReady && (!isAdd && !isWithdraw || quoteReady);
  return (
    <form
      className="flex min-h-[560px] flex-col"
      onSubmit={form.handleSubmit((values) => {
        setSubmitted(values);
        setAmountKobo(amount ?? 0);
        setStep("confirm");
      })}
    >
      <button type="button" onClick={() => router.push("/")} aria-label="Back to home" className="grid h-9 w-9 place-items-center rounded-full border border-deep-soft bg-deep-soft text-lg text-white">←</button>
      <h1 className="mt-4 font-display text-xl font-bold">{isSend ? "Send money" : isAdd ? "Add money" : "Withdraw"}</h1>
      {!isAdd && <p className="mt-1 text-[13px] text-muted">Available <strong className="text-text">{formatNaira(balance.data?.balanceKobo ?? "0")}</strong></p>}
      {isSend && (
        <>
          <label htmlFor="username" className="mt-5 mb-2 text-[13px] text-muted">Send to</label>
          <input id="username" autoComplete="username" {...form.register("username")} placeholder="username" className="rounded-2xl border border-line bg-bg px-4 py-3.5 outline-none focus:border-orange" />
          <p className="min-h-8 pt-2 text-[13px]" role="status" aria-live="polite">
            {ownUsername ? <span className="text-red">You cannot send money to yourself.</span> :
              lookup.isFetching ? "Searching..." :
              lookup.data ? `${lookup.data.displayName} (@${lookup.data.username})` :
              lookup.isError && (lookup.error as ApiError).status === 404 ? <span className="text-red">No Swiftbuck user with that username.</span> :
              username.length >= 3 ? <span className="text-red">Could not look up that username.</span> : null}
          </p>
        </>
      )}
      {isWithdraw && (
        <>
          <p className="mt-4 rounded-xl bg-bg p-3 text-xs text-muted">Transfers are processed securely by Paystack.</p>
          <label htmlFor="bank" className="mt-4 mb-2 text-[13px] text-muted">Bank</label>
          <select id="bank" {...form.register("bank")} className="rounded-2xl border border-line bg-bg px-4 py-3.5 outline-none focus:border-orange"><option value="">Select a bank</option>{banksQuery.data?.map((bank) => <option key={bank.code} value={bank.code}>{bank.name}</option>)}</select>
          <label htmlFor="accountNumber" className="mt-4 mb-2 text-[13px] text-muted">Account number</label>
          <input id="accountNumber" autoComplete="off" inputMode="numeric" maxLength={10} {...form.register("accountNumber")} className="rounded-2xl border border-line bg-bg px-4 py-3.5 outline-none focus:border-orange" />
          {resolveQuery.isFetching && <p className="pt-2 text-xs text-muted">Verifying account...</p>}
          {resolveQuery.data && <label className="mt-3 flex items-center gap-2 text-sm text-muted"><input type="checkbox" {...form.register("accountName", { required: true })} value={resolveQuery.data.account_name} /> I confirm this account belongs to <strong>{resolveQuery.data.account_name}</strong></label>}
          {resolveQuery.isError && <p className="pt-2 text-xs text-red">Could not verify this account.</p>}
        </>
      )}
      <label htmlFor="amount" className="mt-5 text-[13px] text-muted">Amount</label>
      <div className="my-2.5 flex items-baseline justify-center gap-1.5">
        <span className="font-display text-3xl text-muted">₦</span>
        <input id="amount" inputMode="decimal" {...form.register("amount")} placeholder="0" className="w-full max-w-[230px] bg-transparent text-center font-display text-[50px] font-bold tabular-nums text-orange outline-none" />
      </div>
      {isAdd && <p className="text-center text-xs text-muted">Minimum amount is ₦500.</p>}
      {isAdd && depositQuoteData && (
        <p className="text-center text-xs text-muted">
          {`Fee ${formatNaira(String(depositQuoteData.feeKobo))} · You'll receive ${formatNaira(String(depositQuoteData.creditKobo))}`}
        </p>
      )}
      {isWithdraw && withdrawalQuoteData && (
        <p className="text-center text-xs text-muted">
          {`Fee ${formatNaira(String(withdrawalQuoteData.feeKobo))} · Total from wallet ${formatNaira(String(withdrawalQuoteData.totalDebitKobo))}`}
        </p>
      )}
      {isWithdraw && (
        <button
          type="button"
          className="mt-2 text-xs font-semibold text-orange"
          onClick={async () => {
            const balanceKobo = Number(balance.data?.balanceKobo ?? "0");
            let low = 50_000;
            let high = Math.min(balanceKobo, 10_000_000_000);
            let best = 0;
            for (let i = 0; i < 28 && low <= high; i += 1) {
              const candidate = Math.floor((low + high) / 2);
              const candidateQuote = await getWithdrawalQuote(candidate);
              if (candidateQuote.totalDebitKobo <= balanceKobo) {
                best = candidate;
                low = candidate + 1;
              } else {
                high = candidate - 1;
              }
            }
            if (best > 0) form.setValue("amount", (best / 100).toFixed(2));
          }}
        >
          Withdraw all
        </button>
      )}
      <p className="min-h-8 pt-2 text-center text-[13px] text-red" role="alert">
        {overBalance ? `You only have ${formatNaira(balance.data?.balanceKobo ?? "0")} available.` : mutation.error instanceof Error ? mutation.error.message : null}
      </p>
      <div className="mt-auto pt-4"><Button type="submit" disabled={!canReview || mutation.isPending}>{isSend ? "Review transfer" : isAdd ? "Continue" : "Review withdrawal"}</Button></div>
    </form>
  );
}
