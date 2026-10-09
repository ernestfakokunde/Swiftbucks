import { LayoutShell } from "@/components/LayoutShell";

export default function Loading() {
  return <LayoutShell><div className="flex flex-1 animate-pulse flex-col gap-4"><div className="h-11 w-11 rounded-full bg-line" /><div className="h-7 w-40 rounded bg-line" /><div className="mt-8 h-14 rounded-2xl bg-line" /><div className="h-14 rounded-2xl bg-line" /><div className="h-14 rounded-2xl bg-line" /></div></LayoutShell>;
}
