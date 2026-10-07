"use client";

import { useState } from "react";
import { formatNaira } from "@/lib/money";
import { Button } from "./Button";

export function BalanceCard({ balanceKobo }: { balanceKobo: string }) {
  const [hidden, setHidden] = useState(false);

  return (
    <section className="my-1 mb-[18px] rounded-[22px] border border-deep-soft bg-deep p-5 text-white shadow-[0_16px_28px_rgba(13,23,34,0.18)]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-white/65">Wallet balance</span>
        <Button
          type="button"
          variant="ghost"
          className="w-auto px-0 py-0 text-[13px] text-white/70 hover:text-white"
          onClick={() => setHidden((value) => !value)}
          aria-label={hidden ? "Show wallet balance" : "Hide wallet balance"}
        >
          {hidden ? "Show" : "Hide"}
        </Button>
      </div>
      <p className="mt-1 font-display text-[42px] font-bold tabular-nums text-orange">
        {hidden ? "₦ ••••••" : formatNaira(balanceKobo)}
      </p>
    </section>
  );
}
