import Link from "next/link";
import { useState } from "react";
import { formatNaira } from "@/lib/money";
import type { ActivityItem } from "@/lib/api";

function formatActivityDate(value: string) {
  const normalized = value.includes("T") ? value : value.replace(" ", "T").replace(/(\.\d{3})\d+/, "$1");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? "Recent" : date.toLocaleString();
}

export function ActivityList({
  items,
  compact = false,
}: {
  items: ActivityItem[];
  compact?: boolean;
}) {
  const [selected, setSelected] = useState<ActivityItem | null>(null);
  return (
    <div>
      {items.slice(0, compact ? 4 : items.length).map((item) => {
        const incoming = !item.amountKobo.startsWith("-");
        return (
          <button key={item.id} type="button" onClick={() => setSelected(item)} className="flex w-full min-w-0 items-center gap-2 border-t border-line py-2.5 text-left transition-colors hover:bg-bg sm:gap-3 sm:py-3">
            <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full border border-deep-soft bg-deep-soft font-display text-[15px] font-semibold text-white">
              {item.title[0]}
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate">
                {item.title}
                {item.status === "PENDING" || item.status === "RESERVED" || item.status === "PROCESSING" ? (
                  <span className="ml-1.5 inline-block rounded-full border border-orange px-2 py-px text-[11px] text-orange">
                    Processing
                  </span>
                ) : null}
                {item.status === "REVERSED" ? <span className="ml-1.5 inline-block rounded-full border border-red/40 bg-red/10 px-2 py-px text-[11px] text-red">Reversed</span> : null}
              </p>
              <p className="mt-0.5 text-xs text-muted">{formatActivityDate(item.createdAt)}</p>
              {item.feeKobo ? <p className="text-xs text-muted">Fee {formatNaira(item.feeKobo)}</p> : null}
            </div>
            <strong
              className={[
                  "shrink-0 text-right font-display text-xs tabular-nums sm:text-sm",
                incoming ? "text-orange" : "text-text",
              ].join(" ")}
            >
              {incoming ? "+" : ""}
              {formatNaira(item.amountKobo)}
            </strong>
          </button>
        );
      })}
      {compact ? (
        <Link
          href="/activity"
          className="mt-1 block text-right text-[13px] font-medium text-orange hover:underline"
        >
          See all
        </Link>
      ) : null}
      {!items.length ? <p className="py-8 text-center text-sm text-muted">No transactions yet.</p> : null}
      {selected ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-deep/40 p-2 sm:place-items-center sm:p-4" role="presentation" onClick={() => setSelected(null)}>
          <section role="dialog" aria-modal="true" aria-label="Transaction receipt" onClick={(event) => event.stopPropagation()} className="w-full max-w-md rounded-[24px] bg-surface p-5 shadow-2xl sm:p-6">
            <div className="mb-5 flex items-start justify-between"><div><p className="text-xs uppercase tracking-[0.16em] text-muted">Transaction receipt</p><h2 className="mt-1 font-display text-xl font-bold">{selected.title}</h2></div><button type="button" onClick={() => setSelected(null)} className="rounded-full bg-bg px-3 py-1 text-lg text-muted" aria-label="Close receipt">×</button></div>
            <div className="rounded-2xl bg-bg p-4 text-center"><p className="text-xs text-muted">Amount</p><p className="mt-1 font-display text-3xl font-bold tabular-nums">{formatNaira(selected.amountKobo)}</p><span className={["mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium", selected.status === "REVERSED" ? "bg-red/10 text-red" : selected.status === "COMPLETED" || selected.status === "SUCCESS" ? "bg-green-100 text-green-700" : "bg-orange/10 text-orange"].join(" ")}>{selected.status === "REVERSED" ? "Reversed" : selected.status}</span></div>
            <dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-muted">Date</dt><dd className="text-right">{formatActivityDate(selected.createdAt)}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted">Type</dt><dd>{selected.type.replaceAll("_", " ")}</dd></div>{selected.feeKobo ? <div className="flex justify-between gap-4"><dt className="text-muted">Fee</dt><dd>{formatNaira(selected.feeKobo)}</dd></div> : null}<div className="flex justify-between gap-4"><dt className="text-muted">Reference</dt><dd className="max-w-[65%] truncate font-mono text-xs">#{selected.id}</dd></div></dl>
          </section>
        </div>
      ) : null}
    </div>
  );
}
