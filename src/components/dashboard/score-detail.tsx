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
      <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Détail du score ({normalizedTotal}/100)</h2>

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
  const h1 = analyses.find((analysis) => analysis.timeframe === "H1");
  const h4 = analyses.find((analysis) => analysis.timeframe === "H4");
  const trendAligned = Boolean(h1 && h4 && h1.trend === h4.trend && h1.trend !== "range");
  const premiumDiscount = scorePremiumDiscount(activeAnalysis, plan.direction, price);
  const hasStructureShift = activeAnalysis?.structure === "BOS" || activeAnalysis?.structure === "CHoCH";
  const dxyFavorable = isDxyFavorable(fundamental, plan.direction);
  const srReaction = Boolean(activeAnalysis?.retestConfirmed || activeAnalysis?.liquiditySweep);
  const volatilityOk = activeAnalysis ? activeAnalysis.volatility !== "trop dangereuse" : false;
  const spreadOk = spread === null ? true : spread <= 0.8;

  return [
    {
      label: "Tendance H1/H4 alignée",
      note: h1 && h4 ? `${h1.trend} / ${h4.trend}` : "H1/H4 en attente",
      score: trendAligned ? 15 : 0,
      max: 15,
    },
    {
      label: "Zone premium/discount favorable",
      note: premiumDiscount.note,
      score: premiumDiscount.score,
      max: 15,
    },
    {
      label: "Liquidity sweep confirmé",
      note: activeAnalysis?.liquiditySweep ? "Sweep récent confirmé" : "Aucun sweep récent",
      score: activeAnalysis?.liquiditySweep ? 15 : 0,
      max: 15,
    },
    {
      label: "BOS / CHoCH confirmé",
      note: hasStructureShift ? String(activeAnalysis?.structure) : "Aucune cassure structurelle",
      score: hasStructureShift ? 15 : 0,
      max: 15,
    },
    {
      label: "Retest propre (OB/FVG)",
      note: activeAnalysis?.retestConfirmed ? "Retest OB/FVG confirmé" : "Retest OB bear",
      score: activeAnalysis?.retestConfirmed ? 10 : 0,
      max: 10,
    },
    {
      label: "Pas de news high-impact (±30min)",
      note: fundamental.caution ? "News USD proche" : "Aucune news imminente",
      score: fundamental.caution ? 0 : 10,
      max: 10,
    },
    {
      label: "Risk/Reward ≥ 1:2",
      note: plan.riskReward ? `1:${plan.riskReward.toFixed(2)}` : "RR en attente",
      score: plan.riskReward >= 2 ? 10 : 0,
      max: 10,
    },
    {
      label: "Contexte DXY favorable",
      note: `DXY ${formatDxyDirection(fundamental.dxy.direction)}`,
      score: dxyFavorable ? 5 : 0,
      max: 5,
    },
    {
      label: "Réaction S/R confirmée",
      note: srReaction ? "Réaction validée" : "Aucune réaction nette",
      score: srReaction ? 5 : 0,
      max: 5,
    },
    {
      label: "Volatilité acceptable",
      note: `${activeAnalysis?.volatility ?? "attente"} · ATR ${(activeAnalysis?.atr ?? 0).toFixed(2)}`,
      score: volatilityOk ? 3 : 0,
      max: 3,
    },
    {
      label: "Spread acceptable",
      note: spread === null ? "Spread non renseigné" : `${spread.toFixed(2)} USD`,
      score: spreadOk ? 2 : 0,
      max: 2,
    },
  ];
}

function scorePremiumDiscount(activeAnalysis: TimeframeAnalysis | undefined, direction: TradePlan["direction"], price: number) {
  if (!activeAnalysis || !price || !activeAnalysis.support || !activeAnalysis.resistance || activeAnalysis.resistance <= activeAnalysis.support) {
    return { score: 0, note: "Zone non calculée" };
  }

  const midpoint = (activeAnalysis.support + activeAnalysis.resistance) / 2;
  const zone = price >= midpoint ? "premium" : "discount";

  if (direction === "Bullish") {
    return { score: zone === "discount" ? 15 : 5, note: `Prix en ${zone}` };
  }

  if (direction === "Bearish") {
    return { score: zone === "premium" ? 15 : 5, note: `Prix en ${zone}` };
  }

  return { score: 5, note: `Prix en ${zone}` };
}

function isDxyFavorable(fundamental: FundamentalContext, direction: TradePlan["direction"]) {
  if (direction === "Bullish") {
    return fundamental.dxy.direction === "falling";
  }

  if (direction === "Bearish") {
    return fundamental.dxy.direction === "rising";
  }

  return false;
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
