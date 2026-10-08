import { formatNaira } from "@/lib/money";
import { Button } from "./Button";

export type SummaryRow = { label: string; value: string };

export function FlowConfirm({
  amountKobo,
  rows,
  submitLabel,
  onConfirm,
  onEdit,
  isSubmitting,
  error,
}: {
  amountKobo: number;
  rows: SummaryRow[];
  submitLabel: string;
  onConfirm: () => void;
  onEdit: () => void;
  isSubmitting: boolean;
  error?: string | null;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onEdit}
        aria-label="Edit transfer details"
        className="grid h-9 w-9 place-items-center rounded-full border border-deep-soft bg-deep-soft text-lg text-white"
      >
        ←
      </button>
      <h1 className="mt-4 font-display text-xl font-bold">Check and confirm</h1>
      <p className="my-3 text-center font-display text-[40px] font-bold tabular-nums">
        {formatNaira(amountKobo)}
      </p>
      <p className="m-0 text-center text-[13px] text-muted">Please check the details</p>
      {error ? <p className="mt-3 text-center text-[13px] text-red" role="alert">{error}</p> : null}
      <div className="mt-5 overflow-hidden rounded-[18px] border border-line">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-3 px-4 py-3.5 text-sm [&+div]:border-t [&+div]:border-line">
            <span className="text-muted">{row.label}</span>
            <strong className="text-right font-semibold">{row.value}</strong>
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col justify-end pt-5">
        <Button type="button" onClick={onConfirm} disabled={isSubmitting}>
          {isSubmitting ? "Processing..." : `${submitLabel} ${formatNaira(amountKobo)}`}
        </Button>
        <Button type="button" variant="ghost" onClick={onEdit} disabled={isSubmitting}>
          Edit details
        </Button>
      </div>
    </>
  );
}
