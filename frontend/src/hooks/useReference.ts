 "use client";
import { useRef } from "react";

export function useReference(prefix: string) {
  const ref = useRef<string | null>(null);
  return {
    // same reference on every retry of one attempt
    get: () => (ref.current ??= `${prefix}-${crypto.randomUUID()}`),
    // call this after success, or when the user changes the details
    reset: () => { ref.current = null; },
  };
}