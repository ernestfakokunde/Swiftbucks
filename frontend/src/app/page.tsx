"use client";

import { useActivity, useBalance } from "@/hooks/useWallet";
import { LayoutShell } from "@/components/LayoutShell";
import { BalanceCard } from "@/components/BalanceCard";
import { ActionButton } from "@/components/ActionButton";
import { ActivityList } from "@/components/ActivityList";
import { WalletError } from "@/components/WalletError";
import { WalletSkeleton } from "@/components/WalletSkeleton";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

export default function Home() {
  const balance = useBalance();
  const activity = useActivity();
  const { user, logout } = useAuth();

  if (balance.isLoading || activity.isLoading) {
    return (
      <LayoutShell wide>
        <WalletSkeleton />
      </LayoutShell>
    );
  }

  if (balance.isError || activity.isError || !balance.data || !activity.data) {
    return (
      <LayoutShell wide>
        <WalletError
          onRetry={() => {
            void balance.refetch();
            void activity.refetch();
          }}
        />
      </LayoutShell>
    );
  }

  return (
    <LayoutShell wide>
      <header className="mb-[18px] flex items-center justify-between">
        <span className="font-display text-lg font-bold tracking-tight text-deep">⚡ Swiftbuck</span>
        <button type="button" onClick={() => void logout()} aria-label="Log out" className="grid h-9 w-9 place-items-center rounded-full bg-deep font-display text-sm font-bold text-white shadow-[0_8px_16px_rgba(23,32,43,0.18)]">
          {(user?.username[0] ?? "U").toUpperCase()}
        </button>
      </header>
      <p className="m-0 text-[13px] text-muted">Hi, {user?.name ?? user?.username}</p>
      <div className="grid gap-8 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:items-start md:gap-12">
        <section>
          <BalanceCard balanceKobo={balance.data.balanceKobo} />
          <div className="mb-[22px] grid grid-cols-4 gap-2 sm:gap-2.5">
            <ActionButton label="Add money" icon="+" href="/add-money" />
            <ActionButton label="Send" icon="↗" href="/send" />
            <ActionButton label="Withdraw" icon="↓" href="/withdraw" />
          </div>
          <section className="mb-[22px]">
            <h2 className="mb-3 font-display text-base font-bold">Pay bills</h2>
            <Link href="/bills/airtime" className="flex min-h-[72px] items-center gap-3 rounded-[20px] border border-line bg-surface p-3 shadow-sm">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-orange/15 text-2xl">☎</span>
              <span className="min-w-0 flex-1"><strong className="block font-display">Buy airtime</strong><span className="text-xs text-muted">MTN, Airtel, Glo and 9mobile</span></span>
              <span className="flex gap-1.5" aria-hidden="true">
                <i className="h-5 w-5 rounded-full bg-[#FFCC00]" /><i className="h-5 w-5 rounded-full bg-[#E40000]" /><i className="h-5 w-5 rounded-full bg-[#50B651]" /><i className="h-5 w-5 rounded-full bg-[#006E53]" />
              </span><span className="text-xl text-muted">›</span>
            </Link>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {["Data", "Electricity", "TV"].map((label) => <span key={label} aria-disabled="true" className="rounded-2xl border border-line bg-surface p-3 text-center text-xs text-muted opacity-60">{label}<small className="mt-1 block">Soon</small></span>)}
            </div>
          </section>
        </section>
        <section className="md:rounded-2xl md:border md:border-line md:bg-bg md:p-5">
          <h1 className="mb-1 font-display text-base font-bold">Recent activity</h1>
          <ActivityList items={activity.data} compact />
        </section>
      </div>
    </LayoutShell>
  );
}
