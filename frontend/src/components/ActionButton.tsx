import Link from "next/link";

type ActionButtonProps = {
  label: string;
  icon: string;
  href?: string;
  disabled?: boolean;
  note?: string;
};

export function ActionButton({ label, icon, href, disabled, note }: ActionButtonProps) {
  const content = (
    <>
      <span className="grid h-11 w-11 place-items-center rounded-2xl border border-deep-soft bg-deep-soft font-display text-xl text-orange shadow-[0_8px_18px_rgba(23,32,43,0.14)] transition-all duration-200 group-hover:border-orange group-hover:bg-deep sm:h-[50px] sm:w-[50px] md:h-[58px] md:w-[58px]">
        {icon}
      </span>
      <span className="block max-w-full text-center leading-tight">{label}</span>
      {note ? <span className="text-[11px] text-muted">{note}</span> : null}
    </>
  );

  if (disabled) {
    return (
      <span className="flex cursor-default flex-col items-center gap-2 text-xs opacity-45">
        {content}
      </span>
    );
  }

  return (
    <Link
      href={href ?? "#"}
      className="group flex min-w-0 flex-col items-center gap-2 text-[11px] text-text sm:text-xs"
    >
      {content}
    </Link>
  );
}
