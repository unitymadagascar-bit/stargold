import { ArrowUpRight, ChevronRight } from "lucide-react";
import type { TimeframeAnalysis } from "@/types";
import { SignalBadge } from "@/components/ui/signal-badge";
import { ScoreBar } from "@/components/ui/score-bar";

export function TimeframeCard({ analysis }: { analysis: TimeframeAnalysis }) {
  return (
    <article className="rounded-lg border border-white/10 bg-slate-950/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-white">{analysis.timeframe}</h3>
          <p className="mt-1 text-xs text-slate-500">XAUUSD</p>
        </div>
        <SignalBadge signal={analysis.signal} />
      </div>

      <div className="mt-4">
        <ScoreBar value={analysis.score} compact />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <Info label="Trend" value={analysis.trend} />
        <Info label="RSI" value={analysis.rsi.toFixed(1)} />
        <Info label="ATR" value={analysis.atr.toFixed(2)} />
        <Info label="Structure" value={analysis.structure} />
        <Info label="Support" value={analysis.support.toFixed(2)} />
        <Info label="Résistance" value={analysis.resistance.toFixed(2)} />
        <Info label="Sweep" value={analysis.liquiditySweep ? "confirmé" : "non"} />
        <Info label="Retest" value={analysis.retestConfirmed ? "confirmé" : "attente"} />
        <Info label="Volatilité" value={analysis.volatility} />
        <Info label="News" value={analysis.newsNearby ? "proche" : "non"} />
      </dl>

      <div className="mt-4 flex items-center justify-between rounded-md bg-slate-900/80 px-3 py-2">
        <span className="text-xs text-slate-400">Risk/Reward</span>
        <span className="font-mono text-sm text-white">1:{analysis.riskReward.toFixed(2)}</span>
      </div>

      <div className="mt-2 rounded-md bg-slate-900/80 px-3 py-2">
        <p className="text-xs font-semibold text-sky-200">{analysis.waitReason}</p>
        <p className="mt-1 truncate text-[11px] text-slate-500">
          {analysis.missingConditions.length ? analysis.missingConditions.join(", ") : "Conditions OK"}
        </p>
      </div>

      <button
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/[0.07]"
        type="button"
      >
        Details
        <ChevronRight size={16} />
      </button>
    </article>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-900/70 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</dt>
      <dd className="mt-1 flex items-center gap-1 text-slate-200">
        {value}
        {label === "Trend" ? <ArrowUpRight size={13} className="text-slate-500" /> : null}
      </dd>
    </div>
  );
}
