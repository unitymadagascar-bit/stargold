import type { Signal } from "@/types";

const styles: Record<Signal, string> = {
  BUY: "border-emerald-400/35 bg-emerald-400/12 text-emerald-200",
  SELL: "border-rose-400/35 bg-rose-400/12 text-rose-200",
  WAIT: "border-sky-400/35 bg-sky-400/12 text-sky-200",
  "HIGH RISK": "border-amber-400/40 bg-amber-400/12 text-amber-200",
  "NO TRADE": "border-slate-400/35 bg-slate-400/12 text-slate-200",
};

export function SignalBadge({ signal }: { signal: Signal }) {
  return (
    <span className={`inline-flex min-w-20 items-center justify-center rounded-md border px-2.5 py-1 text-xs font-semibold ${styles[signal]}`}>
      {signal}
    </span>
  );
}
