"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/activity", label: "Activity", icon: "▤" },
];

export function BottomNav() {
  const pathname = usePathname();

  if (pathname !== "/" && pathname !== "/activity") {
    return null;
  }

  return (
    <nav
      aria-label="Main navigation"
      className="mt-auto -mx-4 -mb-4 flex border-t border-line px-4 py-1 sm:-mx-5 sm:-mb-5 sm:px-5 md:-mx-8 md:-mb-8 md:px-8"
    >
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "flex flex-1 flex-col items-center gap-0.5 px-3 py-3 text-xs font-medium transition-colors",
              active ? "text-orange" : "text-muted hover:text-text",
            ].join(" ")}
          >
            <span aria-hidden="true" className="font-display text-lg leading-5">
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
