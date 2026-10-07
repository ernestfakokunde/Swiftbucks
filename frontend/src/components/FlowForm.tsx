"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { formatNaira, nairaToKobo } from "@/lib/money";
import {
  mockDeposit,
  mockTransfer,
  mockWithdraw,
  resolveMockAccount,
} from "@/lib/mock";
import { ApiError, lookupUser } from "@/lib/api";
import { useBalance } from "@/hooks/useWallet";
import { useReference } from "@/hooks/useReference";
import { FlowConfirm, type SummaryRow } from "./FlowConfirm";
import { FlowResult } from "./FlowResult";
import { Button } from "./Button";

type FlowMode = "send" | "add" | "withdraw";
type Step = "form" | "confirm" | "done";

const schema = z.object({
  username: z.string().trim().optional(),
  amount: z.string().trim().min(1, "Enter an amount"),
  bank: z.string().optional(),
  accountNumber: z.string().optional(),
});

type Values = z.infer<typeof schema>;

const banks = ["GTBank", "Access Bank", "Zenith Bank", "UBA", "First Bank", "Opay", "Kuda"];

export function FlowForm({ mode }: { mode: FlowMode }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [submitted, setSubmitted] = useState<Values | null>(null);
  const [amountKobo, setAmountKobo] = useState(0);
  const reference = useReference(mode);
  const balance = useBalance(1);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", amount: "", bank: banks[0], accountNumber: "" },
  });
  const watched = useWatch({ control: form.control });
  const username = (watched.username ?? "").replace(/^@/, "").toLowerCase();
  const [debouncedUsername, setDebouncedUsername] = useState("");
  const amountText = watched.amount ?? "";
  const amount = useMemo(() => nairaToKobo(amountText), [amountText]);
  const bank = watched.bank ?? banks[0];
  const accountNumber = watched.accountNumber ?? "";
  const isSend = mode === "send";
  const isWithdraw = mode === "withdraw";
  useEffect(() => {
    if (!isSend) return;
    const timeout = window.setTimeout(() => {
      setDebouncedUsername(username);
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [isSend, username]);

  const lookup = useQuery({
    queryKey: ["username", debouncedUsername],
    queryFn: () => lookupUser(debouncedUsername),
    enabled: isSend && debouncedUsername.length >= 3,
    retry: false,
  });
  const accountLookup = useQuery({
    queryKey: ["account", bank, accountNumber],
    queryFn: () => resolveMockAccount(accountNumber, bank),
    enabled: isWithdraw && /^\d{10}$/.test(accountNumber),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === "send") {
        return mockTransfer({
          receiverUsername: username,
          amountKobo,
          reference: reference.get(),
        });
      }
      if (mode === "add") return mockDeposit({ amountKobo, reference: reference.get() });
      return mockWithdraw({ amountKobo, reference: reference.get() });
    },
  });
  const overBalance =
    isWithdraw &&
    amount !== null &&
    balance.data !== undefined &&
    BigInt(amount) > BigInt(balance.data.balanceKobo);

  useEffect(() => {
    if (!isSend || username.length < 3) {
      form.clearErrors("username");
    } else if (lookup.isError && lookup.error instanceof ApiError && lookup.error.status === 404) {
      form.setError("username", { message: "No Swiftbuck user with that username." });
    } else if (lookup.isError) {
      form.setError("username", {
        message: lookup.error instanceof Error ? lookup.error.message : "Could not look up that username.",
      });
    } else if (lookup.data && debouncedUsername === username) {
      form.clearErrors("username");
    }
  }, [debouncedUsername, form, isSend, lookup.data, lookup.error, lookup.isError, username]);

  async function onSubmit(values: Values) {
    const parsedAmount = nairaToKobo(values.amount);
    const validRecipient = !isSend || (debouncedUsername === username && Boolean(lookup.data));
    const validAccount = !isWithdraw || Boolean(accountLookup.data);
    if (parsedAmount === null || parsedAmount <= 0 || overBalance || !validRecipient || !validAccount) {
      return;
    }
    setSubmitted(values);
    setAmountKobo(parsedAmount);
    setStep("confirm");
  }

  async function confirm() {
    if (!submitted) return;
    try {
      await mutation.mutateAsync();
      setStep("done");
    } catch (error) {
      form.setError("root", {
        message: error instanceof Error ? error.message : "Request failed. Please try again.",
      });
    }
  }

  const title = mode === "send" ? "Send money" : mode === "add" ? "Add money" : "Withdraw";
  const reviewLabel = mode === "send" ? "Review transfer" : mode === "withdraw" ? "Review withdrawal" : "Continue";
  const payLabel = mode === "send" ? "Send" : mode === "add" ? "Pay with Paystack" : "Withdraw";

  if (step === "confirm" && submitted) {
    const rows: SummaryRow[] =
      mode === "send"
        ? [
            { label: "To", value: `${lookup.data?.displayName} (@${lookup.data?.username ?? username})` },
            { label: "Fee", value: "₦0.00" },
            {
              label: "Balance after",
              value: formatNaira((BigInt(balance.data?.balanceKobo ?? "0") - BigInt(amountKobo)).toString()),
            },
          ]
        : mode === "add"
          ? [
              { label: "Pay with", value: "Card or bank transfer" },
              { label: "Powered by", value: "Paystack" },
              {
                label: "Balance after",
                value: formatNaira((BigInt(balance.data?.balanceKobo ?? "0") + BigInt(amountKobo)).toString()),
              },
            ]
          : [
              { label: "To", value: `${submitted.bank} · ${submitted.accountNumber}` },
              { label: "Account name", value: accountLookup.data?.accountName ?? "Ada Obi" },
              { label: "Fee", value: "₦0.00" },
            ];
    return (
      <FlowConfirm
        amountKobo={amountKobo}
        rows={rows}
        submitLabel={payLabel}
        onConfirm={() => void confirm()}
        onEdit={() => {
          setStep("form");
          mutation.reset();
        }}
        isSubmitting={mutation.isPending}
      />
    );
  }

  if (step === "done") {
    const line =
      mode === "send"
        ? `Sent to ${lookup.data?.displayName ?? "your Swiftbuck contact"}`
        : mode === "add"
          ? "added to your wallet"
          : `is on its way to ${submitted?.bank}`;
    return (
      <FlowResult
        amountKobo={amountKobo}
        line={line}
        invite={isSend}
        status={isWithdraw ? "Processing" : "Completed"}
        onDone={() => router.push("/")}
      />
    );
  }

  return (
    <form className="flex min-h-[560px] flex-col" onSubmit={form.handleSubmit(onSubmit)}>
      <button
        type="button"
        onClick={() => router.push("/")}
        aria-label="Back to home"
        className="grid h-9 w-9 place-items-center rounded-full border border-deep-soft bg-deep-soft text-lg text-white"
      >
        ←
      </button>
      <h1 className="mt-4 font-display text-xl font-bold">{title}</h1>
      {isSend || isWithdraw ? (
        <p className="mt-1 text-[13px] text-muted">
          Available <strong className="text-text">{formatNaira(balance.data?.balanceKobo ?? "0")}</strong>
        </p>
      ) : null}
      {isSend ? (
        <>
          <label htmlFor="username" className="mt-5 mb-2 text-[13px] text-muted">Send to</label>
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-bg px-4 py-3.5 focus-within:border-orange">
            <span className="text-muted">@</span>
            <input id="username" autoComplete="off" {...form.register("username")} placeholder="username" className="min-w-0 flex-1 bg-transparent text-base text-text outline-none" />
          </div>
          <div className="min-h-10 pt-2 text-[13px]" role="status" aria-live="polite">
            {username.length >= 3 && (username !== debouncedUsername || lookup.isFetching) ? (
              <span className="text-muted">Looking up @{username}...</span>
            ) : lookup.data && debouncedUsername === username ? (
              <span className="text-text">{lookup.data.displayName} (@{lookup.data.username})</span>
            ) : (
              <span className="text-red" role="alert">{form.formState.errors.username?.message}</span>
            )}
          </div>
        </>
      ) : null}
      {isWithdraw ? (
        <>
          <label htmlFor="bank" className="mt-5 mb-2 text-[13px] text-muted">Bank</label>
          <div className="rounded-2xl border border-line bg-bg px-4 py-3.5 focus-within:border-orange">
            <select id="bank" {...form.register("bank")} className="w-full bg-transparent text-base text-text outline-none">
              {banks.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
          <label htmlFor="accountNumber" className="mt-4 mb-2 text-[13px] text-muted">Account number</label>
          <div className="rounded-2xl border border-line bg-bg px-4 py-3.5 focus-within:border-orange">
            <input id="accountNumber" inputMode="numeric" maxLength={10} {...form.register("accountNumber")} placeholder="10 digits" className="w-full bg-transparent text-base text-text outline-none" />
          </div>
          <div className="min-h-10 pt-2 text-[13px] text-muted" aria-live="polite">
            {accountLookup.data?.accountName}
          </div>
        </>
      ) : null}
      <label htmlFor="amount" className="mt-2 text-[13px] text-muted">Amount</label>
      <div className="my-2.5 flex items-baseline justify-center gap-1.5">
        <span className="font-display text-3xl text-muted">₦</span>
        <input id="amount" inputMode="decimal" placeholder="0" {...form.register("amount")} className="w-full max-w-[230px] bg-transparent text-center font-display text-[50px] font-bold tabular-nums text-orange outline-none" />
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {[1000, 2000, 5000, 10000].map((value) => (
          <button key={value} type="button" onClick={() => form.setValue("amount", value.toString(), { shouldValidate: true })} className="rounded-full border border-line bg-transparent px-3.5 py-2 font-display text-[13px] text-text hover:border-orange">
            ₦{value.toLocaleString("en-NG")}
          </button>
        ))}
      </div>
      <div className="min-h-8 pt-2 text-center text-[13px] text-red" role="alert" aria-live="polite">
        {overBalance
          ? `You only have ${formatNaira(balance.data?.balanceKobo ?? "0")} available.`
          : form.formState.errors.amount?.message ?? form.formState.errors.root?.message}
      </div>
      <div className="mt-auto pt-4">
        <Button type="submit" disabled={form.formState.isSubmitting || overBalance || amount === null || amount <= 0 || (isSend && !lookup.data) || (isWithdraw && !accountLookup.data)}>
          {reviewLabel}
        </Button>
      </div>
    </form>
  );
}
