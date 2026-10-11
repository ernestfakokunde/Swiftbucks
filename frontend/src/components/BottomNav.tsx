"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/activity", label: "Activity", icon: "activity" },
  { href: "/profile", label: "Profile", icon: "profile" },
];

function NavIcon({ name }: { name: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...common}>
      {name === "home" ? <><path d="m3.5 10.5 8.5-7 8.5 7" /><path d="M5.5 9.5v10h13v-10M9.5 19.5v-6h5v6" /></> : null}
      {name === "activity" ? <><path d="M4 19.5V12m5 7.5V5m5 14.5v-10m5 10V8" /><path d="M2.5 20.5h19" /></> : null}
      {name === "profile" ? <><circle cx="12" cy="8" r="3.25" /><path d="M5 20c.5-3.3 3.2-5.3 7-5.3s6.5 2 7 5.3" /></> : null}
    </svg>
  );
}

export function BottomNav({ wide = false }: { wide?: boolean }) {
  const pathname = usePathname();

  if (pathname !== "/" && pathname !== "/activity" && pathname !== "/profile") {
    return null;
  }

  return (
    <nav
      aria-label="Main navigation"
      className={wide
        ? "mx-auto mt-8 flex w-full max-w-[1440px] border-t border-line px-1 py-1"
        : "mt-auto -mx-4 -mb-4 flex border-t border-line px-4 py-1 sm:-mx-5 sm:-mb-5 sm:px-5 md:-mx-8 md:-mb-8 md:px-8"}
    >
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "flex flex-1 flex-col items-center gap-1 rounded-xl px-3 py-2.5 text-[11px] font-medium transition-colors sm:text-xs",
              active ? "bg-orange/10 text-orange" : "text-muted hover:bg-bg hover:text-text",
            ].join(" ")}
          >
            <NavIcon name={item.icon} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
