import type { Candle, Direction, MacroContext, NewsEvent, Timeframe, TimeframeAnalysis, TradePlan } from "@/types";
import { analyzeCandles } from "@/lib/analysis/market-structure";
import { timeframes } from "@/lib/market/timeframes";
import { calculateRiskReward, calculateLotSize } from "@/lib/risk/risk";
import { calculateConfluenceScore, generateFinalDecision, inferDirection } from "@/lib/scoring/confluence";

const MIN_ANALYSIS_CANDLES = 30;

export function getLatestPrice(candleMap: Record<Timeframe, Candle[]>): number {
  return candleMap.M1.at(-1)?.close ?? candleMap.M5.at(-1)?.close ?? candleMap.H1.at(-1)?.close ?? 0;
}

export function buildLiveTimeframeAnalyses({
  candleMap,
  macro,
  news,
}: {
  candleMap: Record<Timeframe, Candle[]>;
  macro: MacroContext;
  news: NewsEvent[];
}): TimeframeAnalysis[] {
  return timeframes.map((timeframe) => {
    const candles = candleMap[timeframe];

    if (candles.length < MIN_ANALYSIS_CANDLES) {
      return {
        timeframe,
        signal: "WAIT",
        score: 0,
        trend: "range",
        rsi: 50,
        atr: 0,
        structure: "range",
        support: 0,
        resistance: 0,
        liquiditySweep: false,
        retestConfirmed: false,
        volatility: "calme",
        newsNearby: news.some((event) => event.impact === "high" && event.minutesAway <= 30),
        riskReward: 0,
        summary: "En attente de suffisamment de bougies live.",
      };
    }

    const analysis = analyzeCandles(candles);
    const price = candles.at(-1)?.close ?? 0;
    const direction = inferDirection(analysis);
    const stopLoss = getStopLoss(direction, price, analysis.support, analysis.resistance, analysis.atr);
    const target = direction === "Bearish" ? price - Math.abs(price - stopLoss) * 2 : price + Math.abs(price - stopLoss) * 2;
    const riskReward = calculateRiskReward(price, stopLoss, target);
    const scoring = calculateConfluenceScore({
      analysis,
      macro,
      news,
      riskReward,
      spreadAcceptable: analysis.volatility !== "trop dangereuse",
      stopLossLogical: Math.abs(price - stopLoss) > Math.max(analysis.atr * 0.4, 0.2),
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
        score: scoring.total,
        riskReward,
        volatility: analysis.volatility,
        dangerousNews: news.some((event) => event.impact === "high" && event.minutesAway <= 30),
        confirmations,
      }),
      score: scoring.total,
      trend: analysis.trend,
      rsi: analysis.rsi,
      atr: analysis.atr,
      structure: analysis.structure,
      support: analysis.support,
      resistance: analysis.resistance,
      liquiditySweep: analysis.liquiditySweep,
      retestConfirmed: analysis.retestConfirmed,
      volatility: analysis.volatility,
      newsNearby: news.some((event) => event.impact === "high" && event.minutesAway <= 30),
      riskReward: Number(riskReward.toFixed(2)),
      summary: scoring.total >= 70 ? "Confluence live exploitable avec confirmation." : "Confluence live incomplète.",
    };
  });
}

export function buildLiveTradePlan({
  candleMap,
  macro,
  news,
}: {
  candleMap: Record<Timeframe, Candle[]>;
  macro: MacroContext;
  news: NewsEvent[];
}): TradePlan {
  const analysisTimeframe = candleMap.H1.length >= MIN_ANALYSIS_CANDLES ? "H1" : "M15";
  const candles = candleMap[analysisTimeframe];
  const price = getLatestPrice(candleMap);

  if (!price || candles.length < MIN_ANALYSIS_CANDLES) {
    return {
      direction: "Neutral",
      decision: "WAIT",
      score: 0,
      summary: "Flux live connecté requis pour calculer un plan fiable. Aucun signal n'est généré depuis des données fictives.",
      entry: price,
      stopLoss: 0,
      takeProfits: [0, 0, 0],
      riskReward: 0,
      lotSize: 0,
      alerts: ["Aucune donnée mock n'est utilisée pour le graphique.", "Connecte un flux XAUUSD temps réel pour activer le plan."],
      scoring: { technical: 0, orderFlow: 0, fundamental: 0, risk: 0, total: 0 },
    };
  }

  const analysis = analyzeCandles(candles);
  const direction = inferDirection(analysis);
  const riskUnit = Math.max(analysis.atr * 1.25, price * 0.001);
  const stopLoss = getStopLoss(direction, price, analysis.support, analysis.resistance, riskUnit);
  const takeProfits = getTakeProfits(direction, price, Math.abs(price - stopLoss));
  const riskReward = calculateRiskReward(price, stopLoss, takeProfits[0]);
  const scoring = calculateConfluenceScore({
    analysis,
    macro,
    news,
    riskReward,
    spreadAcceptable: analysis.volatility !== "trop dangereuse",
    stopLossLogical: true,
  });
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
    dangerousNews: news.some((event) => event.impact === "high" && event.minutesAway <= 30),
    confirmations,
  });

  return {
    direction,
    decision,
    score: scoring.total,
    summary: summarizeDecision(decision, direction),
    entry: round(price),
    stopLoss: round(stopLoss),
    takeProfits: takeProfits.map(round) as [number, number, number],
    riskReward: Number(riskReward.toFixed(2)),
    lotSize: calculateLotSize({ capital: 10000, riskPercent: 1, stopLossDistance: Math.abs(price - stopLoss), pipValue: 10 }),
    alerts: [
      analysis.liquiditySweep ? "Liquidity sweep détecté sur les bougies live." : "Pas de sweep confirmé pour l'instant.",
      analysis.retestConfirmed ? "Retest propre confirmé." : "Retest encore en attente.",
      analysis.volatility === "trop dangereuse" ? "Volatilité trop dangereuse : rester en attente." : `Volatilité ${analysis.volatility}.`,
    ],
    scoring,
  };
}

function getStopLoss(direction: Direction, price: number, support: number, resistance: number, fallbackDistance: number) {
  if (direction === "Bearish") {
    return resistance > price ? resistance + fallbackDistance * 0.25 : price + fallbackDistance;
  }

  return support > 0 && support < price ? support - fallbackDistance * 0.25 : price - fallbackDistance;
}

function getTakeProfits(direction: Direction, price: number, risk: number): [number, number, number] {
  return direction === "Bearish" ? [price - risk * 2, price - risk * 3, price - risk * 4] : [price + risk * 2, price + risk * 3, price + risk * 4];
}

function summarizeDecision(decision: string, direction: Direction) {
  if (decision === "BUY" || decision === "SELL") {
    return `Biais ${direction.toLowerCase()} exploitable, uniquement si la confirmation live reste valide.`;
  }

  if (decision === "HIGH RISK") {
    return "Risque élevé : attendre stabilisation, sweep clair ou retest propre.";
  }

  return "Attente préférable : confirmations live insuffisantes ou RR non optimal.";
}

function round(value: number) {
  return Number(value.toFixed(2));
}
