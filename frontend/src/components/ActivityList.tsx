import Link from "next/link";
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
  return (
    <div>
      {items.slice(0, compact ? 4 : items.length).map((item) => {
        const incoming = !item.amountKobo.startsWith("-");
        return (
          <div key={item.id} className="flex min-w-0 items-center gap-2 border-t border-line py-3 sm:gap-3">
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
          </div>
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
    </div>
  );
}
