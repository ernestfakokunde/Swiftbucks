import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "ghost";
};

export function Button({
  children,
  className = "",
  disabled,
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={[
        "w-full rounded-2xl px-4 py-4 font-display text-base font-bold transition-opacity",
        "focus-visible:outline-2 focus-visible:outline-orange focus-visible:outline-offset-2",
        variant === "primary"
          ? "bg-orange text-on-orange shadow-[0_10px_24px_rgba(249,115,22,0.22)] hover:bg-orange/90 disabled:cursor-not-allowed disabled:opacity-35"
          : "bg-transparent py-3 font-sans text-sm font-medium text-muted hover:text-text",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}
