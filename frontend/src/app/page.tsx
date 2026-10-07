"use client";

import { useActivity, useBalance } from "@/hooks/useWallet";
import { LayoutShell } from "@/components/LayoutShell";
import { BalanceCard } from "@/components/BalanceCard";
import { ActionButton } from "@/components/ActionButton";
import { ActivityList } from "@/components/ActivityList";
import { WalletError } from "@/components/WalletError";
import { WalletSkeleton } from "@/components/WalletSkeleton";

export default function Home() {
  const balance = useBalance(1);
  const activity = useActivity(1);

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
        <span className="grid h-9 w-9 place-items-center rounded-full bg-deep font-display text-sm font-bold text-white shadow-[0_8px_16px_rgba(23,32,43,0.18)]">
          A
        </span>
      </header>
      <p className="m-0 text-[13px] text-muted">Hi, Ada</p>
      <div className="grid gap-8 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:items-start md:gap-12">
        <section>
          <BalanceCard balanceKobo={balance.data.balanceKobo} />
          <div className="mb-[22px] grid grid-cols-4 gap-2 sm:gap-2.5">
            <ActionButton label="Add money" icon="+" href="/add-money" />
            <ActionButton label="Send" icon="↗" href="/send" />
            <ActionButton label="Withdraw" icon="↓" href="/withdraw" />
            <ActionButton label="Airtime" icon="▤" disabled note="Soon" />
          </div>
        </section>
        <section className="md:rounded-2xl md:border md:border-line md:bg-bg md:p-5">
          <h1 className="mb-1 font-display text-base font-bold">Recent activity</h1>
          <ActivityList items={activity.data} compact />
        </section>
      </div>
    </LayoutShell>
  );
}
