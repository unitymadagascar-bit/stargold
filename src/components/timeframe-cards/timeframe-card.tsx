import type { TimeframeAnalysis } from "@/types";
import { SignalBadge } from "@/components/ui/signal-badge";

export function TimeframeCard({
  active,
  analysis,
  onSelect,
}: {
  active: boolean;
  analysis: TimeframeAnalysis;
  onSelect: () => void;
}) {
  const bearish = analysis.signal === "STRONG SELL" || analysis.signal === "WATCH SELL" || analysis.signal === "SELL SCALP READY" || analysis.trend === "bearish";
  const bullish = analysis.signal === "STRONG BUY" || analysis.signal === "WATCH BUY" || analysis.signal === "BUY SCALP READY" || analysis.trend === "bullish";
  const barColor = bearish ? "bg-[#ff333d]" : bullish ? "bg-emerald-300" : "bg-amber-300";

  return (
    <button
      className={`min-h-[186px] rounded-md border bg-[#171717] p-3 text-left transition hover:border-white/35 ${
        active ? "border-white/70 shadow-[0_0_0_1px_rgba(255,255,255,0.25)]" : "border-white/10"
      }`}
      type="button"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-mono text-sm font-semibold text-slate-300">{analysis.timeframe}</h3>
          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-slate-600">{analysis.signalMode}</p>
        </div>
        <SignalBadge signal={analysis.signal} />
      </div>

      <div className="mt-3">
        <div className="h-1 rounded-full bg-white/10">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(4, Math.min(analysis.score, 100))}%` }} />
        </div>
        <div className="mt-1 flex justify-end font-mono text-[10px] text-slate-500">{analysis.score}%</div>
      </div>

      <dl className="mt-3 space-y-0.5 font-mono text-[10px] leading-3">
        <Row label="Trend" value={analysis.trend} hot={analysis.trend !== "range"} />
        <Row label="Struct" value={analysis.structure} hot={analysis.structure === "BOS" || analysis.structure === "CHoCH"} />
        <Row label="Sweep" value={analysis.liquiditySweep ? "YES" : "no"} hot={analysis.liquiditySweep} />
        <Row label="Vol" value={analysis.volatility} hot={analysis.volatility === "volatile"} />
        <Row label="R/R" value={`1:${analysis.riskReward.toFixed(2)}`} hot={analysis.riskReward >= 2} />
      </dl>

      {active ? <p className="mt-3 max-h-8 overflow-hidden text-[10px] font-semibold leading-4 text-slate-300">{analysis.waitReason}</p> : null}
      <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
        {active ? "- hide details" : "+ details"}
      </p>
    </button>
  );
}

function Row({ hot, label, value }: { hot?: boolean; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 leading-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={hot ? "text-amber-200" : "text-slate-200"}>{value}</dd>
    </div>
  );
}
