export function ScoreBar({ value, compact = false }: { value: number; compact?: boolean }) {
  const color = value >= 85 ? "bg-emerald-300" : value >= 70 ? "bg-lime-300" : value >= 50 ? "bg-amber-300" : "bg-rose-300";

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>Score</span>
        <span className="font-mono text-slate-200">{value}/100</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} />
      </div>
    </div>
  );
}
