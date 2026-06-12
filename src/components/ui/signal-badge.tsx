import type { Signal } from "@/types";

const styles: Record<Signal, string> = {
  "STRONG BUY": "border-emerald-400/40 bg-emerald-400/14 text-emerald-100",
  BUY: "border-emerald-400/35 bg-emerald-400/12 text-emerald-100",
  "BUY SCALP READY": "border-lime-400/35 bg-lime-400/12 text-lime-200",
  "PRE-SIGNAL BUY": "border-cyan-300/40 bg-cyan-300/14 text-cyan-100",
  "WATCH BUY": "border-teal-400/35 bg-teal-400/12 text-teal-100",
  "ORB BREAKOUT WATCH": "border-indigo-400/35 bg-indigo-400/12 text-indigo-100",
  "FVG RETEST WATCH": "border-cyan-400/35 bg-cyan-400/12 text-cyan-100",
  WAIT: "border-sky-400/35 bg-sky-400/12 text-sky-200",
  "PRE-SIGNAL SELL": "border-yellow-300/40 bg-yellow-300/14 text-yellow-100",
  "WATCH SELL": "border-amber-400/35 bg-amber-400/12 text-amber-100",
  "SELL SCALP READY": "border-orange-400/35 bg-orange-400/12 text-orange-200",
  SELL: "border-rose-400/35 bg-rose-400/12 text-rose-100",
  "STRONG SELL": "border-rose-400/40 bg-rose-400/14 text-rose-100",
};

export function SignalBadge({ signal }: { signal: Signal }) {
  return (
    <span className={`inline-flex min-w-20 items-center justify-center rounded-md border px-2.5 py-1 text-xs font-semibold ${styles[signal]}`}>
      {signal}
    </span>
  );
}
