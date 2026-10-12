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

const serviceLinks = [
  { href: "/send", title: "Transfer", icon: "transfer", tone: "bg-emerald-50 text-emerald-700" },
  { href: "/bills/data", title: "Data bundle", icon: "data", tone: "bg-teal-50 text-teal-700" },
  { href: "/bills/airtime", title: "Airtime", icon: "airtime", tone: "bg-blue-50 text-blue-700" },
  { href: null, title: "Electricity", icon: "electricity", tone: "bg-lime-50 text-lime-700" },
] as const;

function ServiceIcon({ name }: { name: (typeof serviceLinks)[number]["icon"] }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "transfer") return <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}><path d="M4 7h14m0 0-3-3m3 3-3 3M20 17H6m0 0 3 3m-3-3 3-3" /></svg>;
  if (name === "data") return <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M9 7h6M9 11h6m-6 6h.01M12 17h.01M15 17h.01" /></svg>;
  if (name === "airtime") return <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M10 5h4m-2 13h.01" /><path d="m10 10 2 2 3-3" /></svg>;
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true"><path d="M13.1 1.8 5.7 13h5.1l-.5 9.2L18.3 11h-5.1z" /></svg>;
}

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

          <section aria-labelledby="services-heading" className="rounded-[24px] border border-line bg-surface p-4 shadow-sm sm:p-5">
            <div className="mb-4">
              <h2 id="services-heading" className="font-display text-base font-bold">Services</h2>
              <p className="mt-1 text-xs text-muted">Everyday services, a few taps away.</p>
            </div>
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              {serviceLinks.map((service) => {
                const content = (
                  <>
                    <span aria-hidden="true" className={"grid h-10 w-10 place-items-center rounded-[14px] " + service.tone}>
                      <ServiceIcon name={service.icon} />
                    </span>
                    <span className="mt-2 text-center text-[10px] font-semibold leading-tight text-deep sm:text-xs">{service.title}</span>
                    {service.href === null && <span className="mt-1 text-[8px] font-medium text-muted sm:text-[9px]">Coming soon</span>}
                  </>
                );
                return service.href ? (
                  <Link key={service.title} href={service.href} className="flex min-h-[88px] flex-col items-center justify-center rounded-2xl border border-line/70 bg-white px-1.5 py-2 transition-all hover:-translate-y-0.5 hover:border-orange/40 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange">
                    {content}
                  </Link>
                ) : (
                  <div key={service.title} aria-label={service.title + ", coming soon"} className="flex min-h-[88px] flex-col items-center justify-center rounded-2xl border border-line/70 bg-white/60 px-1.5 py-2 text-muted">
                    {content}
                  </div>
                );
              })}
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
