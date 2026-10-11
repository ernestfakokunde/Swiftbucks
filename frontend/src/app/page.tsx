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

const billLinks = [
  { href: "/bills/airtime", title: "Airtime", description: "Top up any network", icon: "↗", tone: "bg-orange/12 text-orange" },
  { href: "/bills/data", title: "Data bundles", description: "Pick a plan that fits", icon: "◉", tone: "bg-emerald-50 text-emerald-700" },
];

export default function Home() {
  const balance = useBalance();
  const activity = useActivity();
  const { user } = useAuth();

  if (balance.isLoading || activity.isLoading) {
    return <LayoutShell wide><WalletSkeleton /></LayoutShell>;
  }

  if (balance.isError || activity.isError || !balance.data || !activity.data) {
    return (
      <LayoutShell wide>
        <WalletError onRetry={() => { void balance.refetch(); void activity.refetch(); }} />
      </LayoutShell>
    );
  }

  return (
    <LayoutShell wide>
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col">
        <header className="mb-7 flex items-center justify-between gap-4 sm:mb-9">
          <Link href="/" className="flex items-center gap-2.5 text-deep">
            <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-[14px] bg-orange/10 text-orange">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><path d="M13.2 1.8 5.8 13h5.1l-.5 9.2L18.2 11h-5.1z" /></svg>
            </span>
            <span className="font-display text-xl font-bold tracking-tight">Swiftbuck</span>
          </Link>
          <Link href="/profile" aria-label="Open profile" className="grid h-11 w-11 place-items-center rounded-full bg-deep font-display text-sm font-bold text-white shadow-md transition-transform hover:scale-105">
            {(user?.username[0] ?? "U").toUpperCase()}
          </Link>
        </header>

        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <p className="m-0 text-sm text-muted">Your Swiftbuck account</p>
            <h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-deep sm:text-2xl">Hi, {user?.username}</h1>
          </div>
        </div>
        <BalanceCard balanceKobo={balance.data.balanceKobo} />

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)] xl:gap-6">
          <div className="flex flex-col gap-4 sm:gap-6">
            <section aria-label="Quick actions" className="rounded-[24px] border border-line bg-surface p-4 shadow-sm sm:p-5">
              <div className="mb-4">
                <h2 className="font-display text-base font-bold">Quick actions</h2>
                <p className="mt-1 text-xs text-muted">Move money in a few taps.</p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <ActionButton label="Add money" icon="+" href="/add-money" />
                <ActionButton label="Send" icon="↗" href="/send" />
                <ActionButton label="Withdraw" icon="↓" href="/withdraw" />
              </div>
            </section>

          <section aria-labelledby="bills-heading" className="rounded-[24px] border border-line bg-surface p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 id="bills-heading" className="font-display text-base font-bold">Pay a bill</h2>
                <p className="mt-1 text-xs text-muted">Everyday payments, all in one place.</p>
              </div>
              <span className="rounded-full bg-bg px-3 py-1 text-[11px] font-medium text-muted">Bills</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {billLinks.map((bill) => (
                <Link key={bill.href} href={bill.href} className="group flex min-h-[76px] items-center gap-3 rounded-2xl border border-line/80 bg-white p-3 transition-all hover:-translate-y-0.5 hover:border-orange/40 hover:shadow-md">
                  <span aria-hidden="true" className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl ${bill.tone}`}>{bill.icon}</span>
                  <span className="min-w-0 flex-1">
                    <strong className="block font-display text-sm font-semibold">{bill.title}</strong>
                    <span className="mt-0.5 block text-xs text-muted">{bill.description}</span>
                  </span>
                  <span aria-hidden="true" className="text-xl text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-orange">›</span>
                </Link>
              ))}
              <div className="flex min-h-[58px] items-center justify-between rounded-2xl border border-dashed border-line bg-bg/70 px-4 text-sm text-muted sm:col-span-2 xl:col-span-1 2xl:col-span-2">
                <span>Electricity and TV</span><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide">Coming soon</span>
              </div>
            </div>
          </section>
          </div>

        <section aria-labelledby="activity-heading" className="flex flex-col rounded-[24px] border border-line bg-surface p-4 shadow-sm sm:p-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h2 id="activity-heading" className="font-display text-base font-bold">Recent activity</h2>
              <p className="mt-1 text-xs text-muted">Your latest wallet transactions.</p>
            </div>
            <Link href="/activity" className="shrink-0 rounded-full bg-bg px-3 py-2 text-xs font-semibold text-deep transition-colors hover:bg-orange/10 hover:text-orange">View all</Link>
          </div>
          <ActivityList items={activity.data} compact />
        </section>
        </div>
      </div>
    </LayoutShell>
  );
}
