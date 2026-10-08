"use client";

import { Button } from "@/components/Button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="grid min-h-screen place-items-center p-4 text-center"><div><h1 className="font-display text-xl font-bold">Something went wrong</h1><p className="mt-2 text-sm text-muted">Please try again.</p><Button className="mt-4" type="button" onClick={reset}>Retry</Button></div></main>;
}
