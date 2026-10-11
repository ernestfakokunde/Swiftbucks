"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import mtnLogo from "@/assets/mtn.png";
import airtelLogo from "@/assets/airtel.png";
import gloLogo from "@/assets/glo.png";
import mobile9Logo from "@/assets/9mobile.png";

export type NetworkOption = { id: string; name: string };
const logos: Record<string, typeof mtnLogo> = { mtn: mtnLogo, airtel: airtelLogo, glo: gloLogo, etisalat: mobile9Logo };

export function NetworkPicker({ networks, value, onChange, storageKey = "swiftbuck-last-network" }: {
  networks: NetworkOption[]; value: string; onChange: (value: string) => void; storageKey?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = networks.find((network) => network.id === value);
  return <div className="relative mt-2">
    <button ref={selectRef} type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((state) => !state)} className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 text-left">
      {selected && logos[selected.id] ? <Image src={logos[selected.id]} alt="" width={28} height={28} className="h-7 w-7 rounded-full object-contain" /> : null}
      <span className="flex-1">{selected?.name ?? "Select network"}</span><span aria-hidden="true">⌄</span>
    </button>
    {open ? <div role="listbox" className="absolute z-10 mt-2 w-full rounded-2xl border border-line bg-surface p-1 shadow-xl">
      {networks.map((network, index) => <button key={network.id} ref={(element) => { optionRefs.current[index] = element; }} role="option" aria-selected={network.id === value} type="button" className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-bg" onClick={() => { onChange(network.id); if (typeof window !== "undefined") localStorage.setItem(storageKey, network.id); setOpen(false); selectRef.current?.focus(); }} onKeyDown={(event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); optionRefs.current[Math.min(index + 1, networks.length - 1)]?.focus(); }
        if (event.key === "ArrowUp") { event.preventDefault(); optionRefs.current[Math.max(index - 1, 0)]?.focus(); }
        if (event.key === "Escape") { setOpen(false); selectRef.current?.focus(); }
      }}>
        {logos[network.id] ? <Image src={logos[network.id]} alt="" width={28} height={28} className="h-7 w-7 rounded-full object-contain" /> : null}
        {network.name}<span className="ml-auto">{network.id === value ? "✓" : ""}</span>
      </button>)}
    </div> : null}
  </div>;
}
