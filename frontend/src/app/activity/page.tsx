"use client";

import { ActivityList } from "@/components/ActivityList";
import { LayoutShell } from "@/components/LayoutShell";
import { WalletError } from "@/components/WalletError";
import { WalletSkeleton } from "@/components/WalletSkeleton";
import { useActivity } from "@/hooks/useWallet";

export default function ActivityPage() {
  const activity = useActivity();

  return (
    <LayoutShell wide>
      <header className="mb-5">
        <h1 className="font-display text-lg font-bold">Activity</h1>
      </header>
      {activity.isLoading ? <WalletSkeleton /> : null}
      {activity.isError || !activity.data ? (
        <WalletError onRetry={() => void activity.refetch()} />
      ) : (
        <ActivityList items={activity.data} />
      )}
    </LayoutShell>
  );
}
