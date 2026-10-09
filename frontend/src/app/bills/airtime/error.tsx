"use client";

export default function Error({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-[420px] p-5"><h1 className="font-display text-xl font-bold">Could not load airtime</h1><button type="button" onClick={reset} className="mt-5 rounded-2xl bg-orange px-5 py-3">Try again</button></main>;
}
