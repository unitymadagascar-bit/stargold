import type { Signal } from "@/types";

const styles: Record<Signal, string> = {
  "STRONG BUY": "border-emerald-400/40 bg-emerald-400/14 text-emerald-100",
  "BUY SCALP": "border-lime-400/35 bg-lime-400/12 text-lime-200",
  WAIT: "border-sky-400/35 bg-sky-400/12 text-sky-200",
  "SELL SCALP": "border-orange-400/35 bg-orange-400/12 text-orange-200",
  "STRONG SELL": "border-rose-400/40 bg-rose-400/14 text-rose-100",
};

export function SignalBadge({ signal }: { signal: Signal }) {
  return (
    <span className={`inline-flex min-w-20 items-center justify-center rounded-md border px-2.5 py-1 text-xs font-semibold ${styles[signal]}`}>
      {signal}
    </span>
  );
}
