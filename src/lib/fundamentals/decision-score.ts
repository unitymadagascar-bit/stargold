import type { Direction, FundamentalContext, ScoringBreakdown, Signal, TechnicalAnalysis, VolatilityState } from "@/types";
import { interpretDxyBias } from "@/lib/fundamentals/interpretation";

export function calculateFundamentalDecisionScore({
  analysis,
  direction,
  fundamental,
  riskReward,
}: {
  analysis: TechnicalAnalysis;
  direction: Direction;
  fundamental: FundamentalContext;
  riskReward: number;
}): ScoringBreakdown {
  const priceAction = clamp(
    (analysis.retestConfirmed ? 12 : 0) +
      (analysis.liquiditySweep ? 10 : 0) +
      (analysis.support > 0 && analysis.resistance > 0 ? 8 : 0) +
      (analysis.displacement ? 6 : 0) +
      (riskReward >= 2 ? 4 : 0),
    40,
  );
  const marketStructure = clamp(
    (analysis.trend !== "range" ? 7 : 0) +
      (analysis.structure === "BOS" || analysis.structure === "CHoCH" ? 8 : 0) +
      ((direction === "Bullish" && analysis.ema20 > analysis.ema50) || (direction === "Bearish" && analysis.ema20 < analysis.ema50) ? 5 : 0),
    20,
  );
  const dxy = scoreBiasAlignment({ bias: interpretDxyBias(fundamental.dxy), direction, max: 15 });
  const news = fundamental.caution ? 0 : scoreBiasAlignment({ bias: fundamental.newsBias, direction, max: 15 });
  const risk = scoreRisk(analysis.volatility, fundamental.caution, riskReward);

  return {
    technical: priceAction,
    orderFlow: marketStructure,
    fundamental: dxy + news,
    risk,
    total: priceAction + marketStructure + dxy + news + risk,
    priceAction,
    marketStructure,
    dxy,
    news,
    volatilityRisk: risk,
  };
}

export function hasRequiredTechnicalConfirmation(analysis: TechnicalAnalysis) {
  return Boolean(
    analysis.retestConfirmed ||
      analysis.liquiditySweep ||
      analysis.structure === "BOS" ||
      analysis.structure === "CHoCH" ||
      (analysis.support > 0 && analysis.resistance > 0 && analysis.displacement),
  );
}

export function applyFundamentalDecisionGuard({
  baseDecision,
  fundamental,
  hasTechnicalConfirmation,
  score,
}: {
  baseDecision: Signal;
  fundamental: FundamentalContext;
  hasTechnicalConfirmation: boolean;
  score: number;
}): Signal {
  if (baseDecision !== "BUY" && baseDecision !== "SELL") {
    return baseDecision;
  }

  if (fundamental.caution) {
    return "WAIT";
  }

  if (!hasTechnicalConfirmation) {
    return "WAIT";
  }

  if (score < 40) {
    return "NO TRADE";
  }

  if (score < 60) {
    return "WAIT";
  }

  return baseDecision;
}

export function getDecisionStrength(score: number) {
  if (score >= 80) {
    return "signal fort";
  }

  if (score >= 60) {
    return "signal moyen";
  }

  if (score >= 40) {
    return "signal faible / attendre confirmation";
  }

  return "pas de trade recommandé";
}

function scoreBiasAlignment({ bias, direction, max }: { bias: string; direction: Direction; max: number }) {
  if (bias === "neutral" || direction === "Neutral") {
    return Math.round(max * 0.55);
  }

  if ((bias === "bullish-gold" && direction === "Bullish") || (bias === "bearish-gold" && direction === "Bearish")) {
    return max;
  }

  return Math.round(max * 0.2);
}

function scoreRisk(volatility: VolatilityState, caution: boolean, riskReward: number) {
  if (caution || volatility === "trop dangereuse") {
    return 0;
  }

  if (riskReward < 1.5) {
    return 3;
  }

  if (volatility === "volatile") {
    return 5;
  }

  return 10;
}

function clamp(value: number, max: number) {
  return Math.max(0, Math.min(max, value));
}
