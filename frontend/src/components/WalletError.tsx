import { Button } from "./Button";

export function WalletError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm text-muted">We couldn&apos;t load your wallet right now.</p>
      <Button type="button" variant="ghost" className="w-auto" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
