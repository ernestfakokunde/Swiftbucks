"use client";

import { useState } from "react";
import { formatNaira } from "@/lib/money";

export function BalanceCard({ balanceKobo }: { balanceKobo: string }) {
  const [hidden, setHidden] = useState(false);

  return (
    <section className="mb-0 flex min-h-[150px] flex-col justify-center rounded-[24px] border border-deep-soft bg-deep p-5 text-white shadow-[0_16px_28px_rgba(13,23,34,0.16)] sm:min-h-[176px] sm:p-6">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-white/65">Wallet balance</span>
        <button
          type="button"
          className="shrink-0 rounded-lg px-2 py-1 text-[13px] text-white/70 transition-colors hover:text-white"
          onClick={() => setHidden((value) => !value)}
          aria-label={hidden ? "Show wallet balance" : "Hide wallet balance"}
        >
          {hidden ? "Show" : "Hide"}
        </button>
      </div>
      <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap font-display text-[clamp(1.8rem,5vw,3rem)] font-bold leading-tight tracking-tight tabular-nums text-orange">
        {hidden ? "₦ ••••••" : formatNaira(balanceKobo)}
      </p>
    </section>
  );
}
