import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { ProtectedShell } from "./ProtectedShell";

export function LayoutShell({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <ProtectedShell>
      <div
      className={[
        "mx-auto flex min-h-screen w-full flex-col p-3 sm:p-4 md:min-h-0 md:items-center md:justify-center md:p-8",
        wide ? "max-w-[1240px]" : "max-w-[420px]",
      ].join(" ")}
    >
      <main
        className={[
          "flex min-h-[calc(100vh-1.5rem)] w-full flex-1 flex-col rounded-[24px] border border-line bg-surface p-4 shadow-[0_18px_45px_rgba(23,32,43,0.10)] sm:min-h-[640px] sm:rounded-[28px] sm:p-5 md:min-h-[720px] md:p-8 md:shadow-[0_24px_70px_rgba(13,23,34,0.18)]",
          wide ? "md:max-w-[1120px]" : "md:max-w-[420px]",
        ].join(" ")}
      >
        {children}
        <BottomNav />
      </main>
      </div>
    </ProtectedShell>
  );
}
