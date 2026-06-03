import type { Candle, MacroContext, NewsEvent, Timeframe, TimeframeAnalysis, TradePlan } from "@/types";
import { analyzeCandles } from "@/lib/analysis/market-structure";
import { calculateRiskReward, calculateLotSize } from "@/lib/risk/risk";
import { calculateConfluenceScore, generateFinalDecision, inferDirection } from "@/lib/scoring/confluence";

export const timeframes: Timeframe[] = ["M1", "M5", "M15", "M30", "H1", "H4", "Daily"];

export const macroContext: MacroContext = {
  dxyDirection: "Bearish",
  us10yDirection: "Neutral",
  fedTone: "neutral",
  geopoliticalRisk: "medium",
  centralBankBuying: "stable",
};

export const newsEvents: NewsEvent[] = [
  { title: "US PMI manufacturier", impact: "medium", minutesAway: 95 },
  { title: "Discours Powell", impact: "high", minutesAway: 210 },
  { title: "NFP", impact: "high", minutesAway: 2880 },
];

const timeframeMinutes: Record<Timeframe, number> = {
  M1: 1,
  M5: 5,
  M15: 15,
  M30: 30,
  H1: 60,
  H4: 240,
  Daily: 1440,
};

function wave(index: number, seed: number) {
  return Math.sin(index / 9 + seed) * 1.8 + Math.cos(index / 17 + seed) * 2.2;
}

export function generateMockCandles(timeframe: Timeframe, count = 220): Candle[] {
  const minutes = timeframeMinutes[timeframe];
  const now = Math.floor(Date.now() / 1000);
  let close = 2352 + timeframes.indexOf(timeframe) * 0.9;

  return Array.from({ length: count }, (_, index) => {
    const momentum = index > count * 0.58 ? 0.09 : -0.015;
    const drift = momentum * index;
    const noise = wave(index, minutes) + Math.sin(index * 1.7) * 0.55;
    const nextClose = close + drift / count + noise * 0.12;
    const open = close;
    const high = Math.max(open, nextClose) + 0.45 + Math.abs(Math.sin(index)) * 1.2;
    const low = Math.min(open, nextClose) - 0.45 - Math.abs(Math.cos(index / 2)) * 1.1;

    close = nextClose;

    return {
      time: now - (count - index) * minutes * 60,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(nextClose.toFixed(2)),
      volume: Math.round(900 + Math.abs(noise) * 240 + index * 1.5),
    };
  });
}

export const candleMap: Record<Timeframe, Candle[]> = timeframes.reduce(
  (accumulator, timeframe) => ({
    ...accumulator,
    [timeframe]: generateMockCandles(timeframe),
  }),
  {} as Record<Timeframe, Candle[]>,
);

export function buildTimeframeAnalyses(): TimeframeAnalysis[] {
  return timeframes.map((timeframe) => {
    const candles = candleMap[timeframe];
    const analysis = analyzeCandles(candles);
    const price = candles.at(-1)?.close ?? 0;
    const direction = inferDirection(analysis);
    const stopLoss = direction === "Bearish" ? analysis.resistance + 1.2 : analysis.support - 1.2;
    const target = direction === "Bearish" ? price - Math.abs(price - stopLoss) * 2.2 : price + Math.abs(price - stopLoss) * 2.2;
    const riskReward = calculateRiskReward(price, stopLoss, target);
    const score = calculateConfluenceScore({
      analysis,
      macro: macroContext,
      news: newsEvents,
      riskReward,
      spreadAcceptable: analysis.volatility !== "trop dangereuse",
      stopLossLogical: Math.abs(price - stopLoss) > analysis.atr * 0.45,
    });
    const confirmations = [
      analysis.structure === "BOS" || analysis.structure === "CHoCH",
      analysis.liquiditySweep,
      analysis.retestConfirmed,
      analysis.displacement,
      analysis.ema20 !== analysis.ema50,
    ].filter(Boolean).length;

    return {
      timeframe,
      signal: generateFinalDecision({
        direction,
        score: score.total,
        riskReward,
        volatility: analysis.volatility,
        dangerousNews: newsEvents.some((event) => event.impact === "high" && event.minutesAway <= 30),
        confirmations,
      }),
      score: score.total,
      trend: analysis.trend,
      rsi: analysis.rsi,
      atr: analysis.atr,
      structure: analysis.structure,
      support: analysis.support,
      resistance: analysis.resistance,
      liquiditySweep: analysis.liquiditySweep,
      retestConfirmed: analysis.retestConfirmed,
      volatility: analysis.volatility,
      newsNearby: newsEvents.some((event) => event.impact === "high" && event.minutesAway <= 30),
      riskReward: Number(riskReward.toFixed(2)),
      summary:
        score.total >= 70
          ? "Setup intéressant si la confirmation reste valide."
          : "Confluence incomplète, attente préférable.",
    };
  });
}

export function buildTradePlan(): TradePlan {
  const h1Candles = candleMap.H1;
  const analysis = analyzeCandles(h1Candles);
  const direction = inferDirection(analysis);
  const price = h1Candles.at(-1)?.close ?? 0;
  const riskUnit = Math.max(analysis.atr * 1.2, 3.2);
  const stopLoss = direction === "Bearish" ? price + riskUnit : price - riskUnit;
  const takeProfits: [number, number, number] =
    direction === "Bearish"
      ? [price - riskUnit * 2, price - riskUnit * 3, price - riskUnit * 4]
      : [price + riskUnit * 2, price + riskUnit * 3, price + riskUnit * 4];
  const riskReward = calculateRiskReward(price, stopLoss, takeProfits[0]);
  const scoring = calculateConfluenceScore({
    analysis,
    macro: macroContext,
    news: newsEvents,
    riskReward,
    spreadAcceptable: analysis.volatility !== "trop dangereuse",
    stopLossLogical: true,
  });
  const dangerousNews = newsEvents.some((event) => event.impact === "high" && event.minutesAway <= 30);
  const confirmations = [
    analysis.structure === "BOS" || analysis.structure === "CHoCH",
    analysis.liquiditySweep,
    analysis.retestConfirmed,
    analysis.displacement,
    analysis.ema20 !== analysis.ema50,
  ].filter(Boolean).length;
  const decision = generateFinalDecision({
    direction,
    score: scoring.total,
    riskReward,
    volatility: analysis.volatility,
    dangerousNews,
    confirmations,
  });

  return {
    direction,
    decision,
    score: scoring.total,
    summary:
      decision === "BUY" || decision === "SELL"
        ? "Biais exploitable, mais seulement avec confirmation de retest et risque contrôlé."
        : "Le marché demande encore de la confirmation avant d'agir.",
    entry: Number(price.toFixed(2)),
    stopLoss: Number(stopLoss.toFixed(2)),
    takeProfits: takeProfits.map((target) => Number(target.toFixed(2))) as [number, number, number],
    riskReward: Number(riskReward.toFixed(2)),
    lotSize: calculateLotSize({ capital: 10000, riskPercent: 1, stopLossDistance: Math.abs(price - stopLoss), pipValue: 10 }),
    alerts: [
      analysis.volatility === "volatile" ? "Risque élevé : les mèches peuvent chasser les stops." : "Volatilité exploitable sous contrôle.",
      "Prix proche d'une zone de liquidité. Attendre un sweep ou une confirmation.",
      "Macro DXY/US10Y globalement cohérente, sans signal agressif.",
    ],
    scoring,
  };
}
