import type { FundamentalContext, TimeframeAnalysis, TradePlan } from "@/types";

interface ScoreDetailItem {
  label: string;
  note: string;
  score: number;
  max: number;
}

export function ScoreDetail({
  activeAnalysis,
  analyses,
  fundamental,
  plan,
  price,
  spread,
}: {
  activeAnalysis?: TimeframeAnalysis;
  analyses: TimeframeAnalysis[];
  fundamental: FundamentalContext;
  plan: TradePlan;
  price: number;
  spread: number | null;
}) {
  const items = buildScoreDetail({ activeAnalysis, analyses, fundamental, plan, price, spread });
  const total = items.reduce((sum, item) => sum + item.score, 0);
  const max = items.reduce((sum, item) => sum + item.max, 0);
  const normalizedTotal = Math.round((total / max) * 100);

  return (
    <section className="rounded-lg border border-white/10 bg-[#111111] p-4">
      <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Detail du score ({normalizedTotal}/100)</h2>

      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-4 text-white">{item.label}</p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">{item.note}</p>
            </div>
            <p className={`font-mono text-xs font-semibold ${item.score === item.max ? "text-emerald-300" : item.score > 0 ? "text-amber-300" : "text-slate-500"}`}>
              {item.score}/{item.max}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function buildScoreDetail({
  activeAnalysis,
  analyses,
  fundamental,
  plan,
  price,
  spread,
}: {
  activeAnalysis?: TimeframeAnalysis;
  analyses: TimeframeAnalysis[];
  fundamental: FundamentalContext;
  plan: TradePlan;
  price: number;
  spread: number | null;
}): ScoreDetailItem[] {
  void analyses;
  void price;
  const liquidity = activeAnalysis?.liquidity ?? plan.liquidity;

  return [
    {
      label: "Price Action",
      note: activeAnalysis ? `Retest ${activeAnalysis.retestConfirmed ? "oui" : "non"} - ATR ${activeAnalysis.atr.toFixed(2)}` : "En attente",
      score: plan.scoring.priceAction ?? plan.scoring.technical,
      max: 30,
    },
    {
      label: "Structure du marche",
      note: activeAnalysis ? `${activeAnalysis.trend} - ${activeAnalysis.structure}` : "En attente",
      score: plan.scoring.marketStructure ?? 0,
      max: 20,
    },
    {
      label: "Liquidite",
      note: liquidity ? `${liquidity.type} - ${liquidity.probableDirection} - ${liquidity.confidence}/100` : "En attente",
      score: plan.scoring.liquidity ?? 0,
      max: 20,
    },
    {
      label: "DXY",
      note: `DXY ${formatDxyDirection(fundamental.dxy.direction)}`,
      score: plan.scoring.dxy ?? 0,
      max: 10,
    },
    {
      label: "News economiques",
      note: fundamental.caution ? "News USD proche" : "Aucune news imminente",
      score: plan.scoring.news ?? 0,
      max: 10,
    },
    {
      label: "Risque / volatilite",
      note: spread === null ? `RR 1:${plan.riskReward.toFixed(2)}` : `RR 1:${plan.riskReward.toFixed(2)} - spread ${spread.toFixed(2)}`,
      score: plan.scoring.volatilityRisk ?? plan.scoring.risk,
      max: 10,
    },
  ];
}

function formatDxyDirection(direction: FundamentalContext["dxy"]["direction"]) {
  if (direction === "unknown") {
    return "neutre/range";
  }

  if (direction === "rising") {
    return "haussier";
  }

  if (direction === "falling") {
    return "baissier";
  }

  return "range";
}
