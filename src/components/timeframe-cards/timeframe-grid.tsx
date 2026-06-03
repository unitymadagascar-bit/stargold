import type { TimeframeAnalysis } from "@/types";
import { TimeframeCard } from "@/components/timeframe-cards/timeframe-card";

export function TimeframeGrid({ analyses }: { analyses: TimeframeAnalysis[] }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Cartes par timeframe</h2>
          <p className="mt-1 text-sm text-slate-400">Confluence multi-timeframe avec confirmation obligatoire avant signal agressif.</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {analyses.map((analysis) => (
          <TimeframeCard key={analysis.timeframe} analysis={analysis} />
        ))}
      </div>
    </section>
  );
}
