 "use client";
import { useCallback, useMemo, useRef } from "react";

export function useReference(prefix: string) {
  const ref = useRef<string | null>(null);
  const get = useCallback(
    () => (ref.current ??= `${prefix}-${crypto.randomUUID()}`),
    [prefix],
  );
  const reset = useCallback(() => {
      ref.current = null;
    }, []);
  return useMemo(() => ({ get, reset }), [get, reset]);
}