export function WalletSkeleton() {
  return (
    <div className="animate-pulse" aria-label="Loading wallet" role="status">
      <div className="mb-[18px] h-[128px] rounded-[22px] bg-bg" />
      <div className="mb-6 grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-[82px] rounded-xl bg-bg" />
        ))}
      </div>
      <div className="h-5 w-36 rounded bg-bg" />
      <div className="mt-3 h-16 rounded bg-bg" />
      <span className="sr-only">Loading wallet data</span>
    </div>
  );
}
