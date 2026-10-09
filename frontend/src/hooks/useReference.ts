 "use client";
import { useCallback, useMemo, useRef } from "react";

type StoredReference = {
  fingerprint: string;
  value: string;
};

export function useReference(prefix: string, fingerprint = "") {
  const ref = useRef<StoredReference | null>(null);
  const storageKey = `swiftbuck-ref-${prefix}`;
  const get = useCallback(
    () => {
      if (ref.current?.fingerprint === fingerprint) {
        return ref.current.value;
      }

      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as StoredReference;
          if (parsed.fingerprint === fingerprint && typeof parsed.value === "string") {
            ref.current = parsed;
            return parsed.value;
          }
        } catch {
          // Invalid stored data is replaced with a fresh reference.
        }
      }

      const next = { fingerprint, value: `${prefix}-${crypto.randomUUID()}` };
      ref.current = next;
      sessionStorage.setItem(storageKey, JSON.stringify(next));
      return next.value;
    },
    [fingerprint, prefix, storageKey],
  );
  const reset = useCallback(() => {
    ref.current = null;
    sessionStorage.removeItem(storageKey);
  }, [storageKey]);
  return useMemo(() => ({ get, reset }), [get, reset]);
}