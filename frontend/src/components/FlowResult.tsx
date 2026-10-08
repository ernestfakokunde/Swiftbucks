"use client";

import { motion, useReducedMotion } from "motion/react";
import { formatNaira } from "@/lib/money";
import { Button } from "./Button";

type FlowResultProps = {
  amountKobo: number;
  line: string;
  onDone: () => void;
  invite?: boolean;
  status?: "Completed" | "Processing";
};

export function FlowResult({ amountKobo, line, onDone, invite, status }: FlowResultProps) {
  const reduceMotion = useReducedMotion();

  return (
    <>
      <motion.svg
        width="80"
        height="80"
        viewBox="0 0 84 84"
        aria-hidden="true"
        className="mx-auto my-3 block"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <motion.circle
          cx="42"
          cy="42"
          r="40"
          fill="none"
          stroke="var(--orange)"
          strokeWidth="4"
          initial={reduceMotion ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
        <motion.path
          d="M26 43l11 11 21-23"
          fill="none"
          stroke="var(--orange)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduceMotion ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4, delay: 0.55, ease: "easeOut" }}
        />
      </motion.svg>
      <p className="my-1 text-center font-display text-[40px] font-bold tabular-nums">
        {formatNaira(amountKobo)}
      </p>
      <p className="m-0 text-center text-[13px] text-muted">{line}</p>
      <div className="mt-4 text-center">
        <span className="inline-block rounded-full border border-line px-3.5 py-1.5 text-[13px]">
          {status ?? "Completed"}
        </span>
      </div>
      {invite ? (
        <div className="mt-5 flex items-center gap-3 rounded-[18px] border border-orange p-3.5 text-sm">
          <p className="m-0 flex-1">
            <strong className="block font-display text-[15px] text-orange">
              Know someone not on Swiftbuck?
            </strong>
            Invite them and send in seconds.
          </p>
          <button
            type="button"
            className="rounded-xl border border-orange bg-transparent px-3.5 py-2 text-[13px] font-semibold text-orange"
            onClick={() => void navigator.clipboard?.writeText("https://swiftbuck.app/join")}
          >
            Copy link
          </button>
        </div>
      ) : null}
      <div className="flex flex-1 items-end pt-5">
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </div>
    </>
  );
}
