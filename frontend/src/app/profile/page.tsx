"use client";

import { LayoutShell } from "@/components/LayoutShell";
import { BalanceCard } from "@/components/BalanceCard";
import { Button } from "@/components/Button";
import { WalletError } from "@/components/WalletError";
import { useAuth } from "@/context/AuthContext";
import { useBalance } from "@/hooks/useWallet";

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const balance = useBalance();

  if (balance.isError) {
    return <LayoutShell><WalletError onRetry={() => void balance.refetch()} /></LayoutShell>;
  }

  return (
    <LayoutShell>
      <div className="flex min-h-[560px] flex-1 flex-col">
        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Your account</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">Profile</h1>
        </div>

        <section className="mb-5 flex items-center gap-4 rounded-[22px] border border-line bg-bg/70 p-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-deep font-display text-xl font-bold text-white">
            {(user?.username[0] ?? "U").toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg font-bold">{user?.name || user?.username}</h2>
            <p className="truncate text-sm text-muted">@{user?.username}</p>
          </div>
        </section>

        {balance.isLoading ? (
          <div className="mb-5 h-40 animate-pulse rounded-[24px] bg-bg" aria-label="Loading wallet balance" />
        ) : balance.data ? (
          <BalanceCard balanceKobo={balance.data.balanceKobo} />
        ) : null}

        <section className="rounded-[22px] border border-line bg-surface p-4">
          <h2 className="mb-4 font-display text-sm font-bold">Account details</h2>
          <dl className="space-y-4 text-sm">
            <div><dt className="text-xs text-muted">Username</dt><dd className="mt-1 font-medium">@{user?.username}</dd></div>
            <div><dt className="text-xs text-muted">Email address</dt><dd className="mt-1 break-all font-medium">{user?.email}</dd></div>
          </dl>
        </section>

        <div className="mt-auto pt-6">
          <Button type="button" variant="ghost" onClick={() => void logout()}>Log out</Button>
        </div>
      </div>
    </LayoutShell>
  );
}
