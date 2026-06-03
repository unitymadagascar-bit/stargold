import type {
  Direction,
  MacroContext,
  NewsEvent,
  ScoringBreakdown,
  Signal,
  TechnicalAnalysis,
} from "@/types";

export function inferDirection(analysis: TechnicalAnalysis): Direction {
  const bullishSignals = [
    analysis.trend === "bullish",
    analysis.structure === "bullish" || analysis.structure === "BOS",
    analysis.ema20 > analysis.ema50,
    analysis.rsi > 52,
  ].filter(Boolean).length;
  const bearishSignals = [
    analysis.trend === "bearish",
    analysis.structure === "bearish" || analysis.structure === "CHoCH",
    analysis.ema20 < analysis.ema50,
    analysis.rsi < 48,
  ].filter(Boolean).length;

  if (bullishSignals >= bearishSignals + 2) {
    return "Bullish";
  }

  if (bearishSignals >= bullishSignals + 2) {
    return "Bearish";
  }

  return "Neutral";
}

export function calculateConfluenceScore({
  analysis,
  macro,
  news,
  riskReward,
  spreadAcceptable,
  stopLossLogical,
}: {
  analysis: TechnicalAnalysis;
  macro: MacroContext;
  news: NewsEvent[];
  riskReward: number;
  spreadAcceptable: boolean;
  stopLossLogical: boolean;
}): ScoringBreakdown {
  const direction = inferDirection(analysis);
  const technical =
    (analysis.trend !== "range" ? 10 : 0) +
    (analysis.support > 0 && analysis.resistance > 0 ? 10 : 0) +
    (analysis.structure === "BOS" || analysis.structure === "CHoCH" ? 10 : 0) +
    (analysis.retestConfirmed ? 5 : 0) +
    (analysis.ema20 !== analysis.ema50 ? 5 : 0);

  const orderFlow =
    (analysis.liquiditySweep ? 10 : 0) +
    (analysis.orderBlock ? 5 : 0) +
    (analysis.fvg ? 5 : 0) +
    (analysis.displacement ? 5 : 0);

  const dxyCoherent =
    (direction === "Bullish" && macro.dxyDirection === "Bearish") ||
    (direction === "Bearish" && macro.dxyDirection === "Bullish") ||
    direction === "Neutral";
  const us10yCoherent =
    (direction === "Bullish" && macro.us10yDirection !== "Bullish") ||
    (direction === "Bearish" && macro.us10yDirection !== "Bearish") ||
    direction === "Neutral";
  const macroClear = macro.fedTone !== "neutral" || macro.geopoliticalRisk !== "medium";
  const fundamental = (dxyCoherent ? 5 : 0) + (us10yCoherent ? 5 : 0) + (macroClear ? 5 : 0);

  const dangerousNews = news.some((event) => event.impact === "high" && event.minutesAway <= 30);
  const risk =
    (riskReward >= 2 ? 10 : 0) +
    (stopLossLogical ? 5 : 0) +
    (!dangerousNews ? 3 : 0) +
    (spreadAcceptable ? 2 : 0);

  const penalty =
    (analysis.fakeout ? 10 : 0) +
    (analysis.volatility === "trop dangereuse" ? 18 : 0) +
    (dangerousNews ? 20 : 0) +
    (riskReward < 1.5 ? 10 : 0);

  return {
    technical,
    orderFlow,
    fundamental,
    risk,
    total: Math.max(0, Math.min(100, technical + orderFlow + fundamental + risk - penalty)),
  };
}

export function generateFinalDecision({
  direction,
  score,
  riskReward,
  volatility,
  dangerousNews,
  confirmations,
}: {
  direction: Direction;
  score: number;
  riskReward: number;
  volatility: string;
  dangerousNews: boolean;
  confirmations: number;
}): Signal {
  if (dangerousNews || volatility === "trop dangereuse") {
    return "HIGH RISK";
  }

  if (riskReward < 1.2) {
    return "NO TRADE";
  }

  if (score < 50 || confirmations < 3 || direction === "Neutral") {
    return "WAIT";
  }

  if (score >= 70 && direction === "Bullish") {
    return "BUY";
  }

  if (score >= 70 && direction === "Bearish") {
    return "SELL";
  }

  return "WAIT";
}
