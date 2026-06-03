import { Check, Minus, X } from "lucide-react";

const checks = [
  { label: "Tendance H4/H1 claire", status: "yes" },
  { label: "Prix sur zone importante", status: "yes" },
  { label: "Liquidity sweep", status: "wait" },
  { label: "BOS/CHoCH", status: "yes" },
  { label: "Retest propre", status: "wait" },
  { label: "SL logique", status: "yes" },
  { label: "TP réaliste", status: "yes" },
  { label: "RR >= 1:2", status: "yes" },
  { label: "News proche", status: "no" },
  { label: "Spread acceptable", status: "yes" },
  { label: "Volatilité acceptable", status: "yes" },
  { label: "Trade sans émotion", status: "wait" },
] as const;

export function TradeChecklist() {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/55 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Checklist avant trade</h2>
        <span className="rounded-md border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-xs font-medium text-amber-200">Discipline</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {checks.map((check) => (
          <div key={check.label} className="flex items-center gap-3 rounded-md bg-slate-900/70 px-3 py-2 text-sm text-slate-300">
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-md ${
                check.status === "yes"
                  ? "bg-emerald-400/15 text-emerald-200"
                  : check.status === "no"
                    ? "bg-rose-400/15 text-rose-200"
                    : "bg-sky-400/15 text-sky-200"
              }`}
            >
              {check.status === "yes" ? <Check size={15} /> : check.status === "no" ? <X size={15} /> : <Minus size={15} />}
            </span>
            <span>{check.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
