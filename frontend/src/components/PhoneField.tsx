export const normalizePhone = (value: string) => value.replace(/\s|-/g, "").replace(/^\+234/, "0").replace(/\D/g, "").slice(0, 11);
export const displayPhone = (value: string) => value.length > 3 ? `${value.slice(0, 4)} ${value.slice(4, 7)} ${value.slice(7)}`.trim() : value;
export const validNigerianPhone = (value: string) => /^0[789][01]\d{8}$/.test(value);

export function PhoneField({ id, value, onChange, compact = false }: { id: string; value: string; onChange: (value: string) => void; compact?: boolean }) {
  return <>
    <label htmlFor={id} className="mt-5 block text-[13px] text-muted">Phone number</label>
    <input id={id} inputMode="numeric" autoComplete="tel" maxLength={13} value={displayPhone(value)} onChange={(event) => onChange(normalizePhone(event.target.value))} className={`mt-2 block w-full rounded-xl border border-line bg-bg outline-none focus:border-orange ${compact ? "min-h-10 px-3 py-2 text-sm" : "min-h-12 rounded-2xl px-4 py-3.5"}`} />
    {value && !validNigerianPhone(value) ? <p className="mt-2 text-xs text-red" role="alert">Enter a valid Nigerian phone number.</p> : null}
  </>;
}
