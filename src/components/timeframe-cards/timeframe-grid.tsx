import type { Timeframe, TimeframeAnalysis } from "@/types";
import { TimeframeCard } from "@/components/timeframe-cards/timeframe-card";

export function TimeframeGrid({
  activeTimeframe,
  analyses,
  onTimeframeChange,
}: {
  activeTimeframe: Timeframe;
  analyses: TimeframeAnalysis[];
  onTimeframeChange: (timeframe: Timeframe) => void;
}) {
  return (
    <section>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-7">
        {analyses.map((analysis) => (
          <TimeframeCard
            key={analysis.timeframe}
            active={analysis.timeframe === activeTimeframe}
            analysis={analysis}
            onSelect={() => onTimeframeChange(analysis.timeframe)}
          />
        ))}
      </div>
    </section>
  );
}
