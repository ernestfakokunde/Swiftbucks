function SwiftbuckMark({ className = "" }: { className?: string }) {
  return (
    <div className={`auth-logo-art ${className}`} aria-label="Swiftbuck payment logo" role="img">
      <svg viewBox="0 0 180 180" aria-hidden="true">
        <rect className="auth-logo-tile" width="180" height="180" rx="42" />
        <g className="auth-logo-lines" stroke="white" strokeWidth="8" strokeLinecap="round">
          <line x1="32" y1="72" x2="56" y2="72" />
          <line x1="20" y1="90" x2="56" y2="90" />
          <line x1="32" y1="108" x2="56" y2="108" />
        </g>
        <g className="auth-logo-coin">
          <circle cx="108" cy="90" r="42" fill="white" />
          <g stroke="var(--orange)" strokeWidth="6" strokeLinecap="round" fill="none">
            <path d="M118 77C118 72 113 70 108 70C102 70 98 73 98 78C98 84 104 86 108 88C113 90 119 92 119 99C119 106 114 110 108 110C102 110 97 107 97 102" />
            <line x1="108" y1="63" x2="108" y2="117" />
          </g>
        </g>
      </svg>
    </div>
  );
}

export function AuthShowcase({
  mode,
}: {
  mode: "login" | "signup";
}) {
  return (
    <>
      <div className="flex items-center justify-center gap-3 py-2 lg:hidden">
        <SwiftbuckMark className="mobile" />
        <span className="font-display text-2xl font-bold text-deep">Swiftbuck</span>
      </div>
      <section className="auth-showcase relative hidden min-h-[620px] overflow-hidden p-8 text-text lg:flex lg:flex-col lg:justify-between">
      <div className="relative z-10 flex items-center gap-2 font-display text-lg font-bold">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange text-deep">₿</span>
        Swiftbuck
      </div>
      <div className="auth-showcase-content relative z-10">
        <SwiftbuckMark className="mx-auto" />
        <p className="auth-showcase-wordmark mt-7 text-center font-display text-4xl font-bold tracking-tight">
          Swiftbuck
        </p>
        <p className="auth-showcase-tagline mt-3 text-center text-sm text-muted">
          {mode === "login"
            ? "Your money, ready when you are."
            : "Start moving money with confidence."}
        </p>
      </div>
      <div className="relative z-10 flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-muted">
        <span>Fast</span>
        <span className="mx-4 h-px flex-1 bg-line" />
        <span>Clear</span>
        <span className="mx-4 h-px flex-1 bg-line" />
        <span>Simple</span>
      </div>
      <div className="auth-showcase-glow" />
      </section>
    </>
  );
}
