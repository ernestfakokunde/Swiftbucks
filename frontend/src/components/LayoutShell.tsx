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
        "mx-auto flex min-h-screen w-full flex-col",
        wide
          ? "max-w-none px-3 py-3 sm:px-6 sm:py-5 md:px-8 md:py-6"
          : "max-w-[420px] p-2 sm:p-4 md:min-h-0 md:items-center md:justify-center md:p-8",
      ].join(" ")}
    >
      <main
        className={[
          "flex w-full flex-1 flex-col",
          wide
            ? "min-h-[calc(100vh-1.5rem)] bg-transparent px-1 py-2 sm:min-h-[calc(100vh-2.5rem)] sm:px-2 md:min-h-[calc(100vh-3rem)] md:max-w-none md:px-0 md:py-0"
            : "min-h-[calc(100vh-1rem)] rounded-[18px] border border-line bg-surface p-3 shadow-[0_18px_45px_rgba(23,32,43,0.10)] sm:min-h-[640px] sm:rounded-[28px] sm:p-5 md:min-h-[720px] md:max-w-[420px] md:p-8 md:shadow-[0_24px_70px_rgba(13,23,34,0.18)]",
        ].join(" ")}
      >
        {children}
        <BottomNav wide={wide} />
      </main>
      </div>
    </ProtectedShell>
  );
}
