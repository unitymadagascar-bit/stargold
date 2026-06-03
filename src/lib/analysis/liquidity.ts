import type { Candle, LiquidityAnalysis, LiquidityDirection, LiquidityZone } from "@/types";
import { calculateATR } from "@/lib/indicators";

const LOOKBACK = 80;

export function detectLiquidityAnalysis(candles: Candle[], newsRisk = false): LiquidityAnalysis {
  const last = candles.at(-1);
  const previous = candles.at(-2);

  if (!last || !previous || candles.length < 12) {
    return emptyLiquidityAnalysis(newsRisk);
  }

  const atr = calculateATR(candles);
  const recent = candles.slice(-LOOKBACK);
  const prior = candles.slice(-24, -1);
  const tolerance = Math.max(atr * 0.22, last.close * 0.00012);
  const buySideZones = detectZones(recent, "buy-side liquidity", tolerance);
  const sellSideZones = detectZones(recent, "sell-side liquidity", tolerance);
  const equalHighs = buySideZones.filter((zone) => zone.equalLevel);
  const equalLows = sellSideZones.filter((zone) => zone.equalLevel);
  const priorHigh = Math.max(...prior.map((candle) => candle.high));
  const priorLow = Math.min(...prior.map((candle) => candle.low));
  const body = Math.max(Math.abs(last.close - last.open), atr * 0.05);
  const upperWick = last.high - Math.max(last.close, last.open);
  const lowerWick = Math.min(last.close, last.open) - last.low;
  const buySideSweep = last.high > priorHigh + tolerance && last.close < priorHigh;
  const sellSideSweep = last.low < priorLow - tolerance && last.close > priorLow;
  const buySideContinuation = last.close > priorHigh + tolerance && previous.close <= priorHigh;
  const sellSideContinuation = last.close < priorLow - tolerance && previous.close >= priorLow;
  const bearishRejection = buySideSweep && upperWick >= body * 1.15;
  const bullishRejection = sellSideSweep && lowerWick >= body * 1.15;
  const longWick = upperWick >= body * 1.5 || lowerWick >= body * 1.5;
  const falseBreakout = buySideSweep || sellSideSweep;
  const realBreakoutContinuation = buySideContinuation || sellSideContinuation || detectRetestContinuation({ candles, priorHigh, priorLow, tolerance });
  const consolidationBeforeImpulse = detectConsolidationBeforeImpulse(candles, atr);
  const activeSession = getActiveSession(last.time);
  const probableDirection = getProbableDirection({
    buySideContinuation,
    buySideSweep,
    sellSideContinuation,
    sellSideSweep,
    bearishRejection,
    bullishRejection,
    realBreakoutContinuation,
  });
  const zone = chooseActiveZone({
    buySideZones,
    sellSideZones,
    buySideSweep,
    sellSideSweep,
    probableDirection,
    price: last.close,
  });
  const confidence = scoreLiquidity({
    activeSession,
    consolidationBeforeImpulse,
    equalHighs: equalHighs.length,
    equalLows: equalLows.length,
    falseBreakout,
    longWick,
    newsRisk,
    realBreakoutContinuation,
    rejectionConfirmed: bearishRejection || bullishRejection,
    sweepDetected: buySideSweep || sellSideSweep,
  });
  const riskLevel = newsRisk && (buySideSweep || sellSideSweep) ? "eleve" : confidence >= 70 ? "modere" : "faible";
  const cautionMessage = getCautionMessage({
    newsRisk,
    probableDirection,
    realBreakoutContinuation,
    rejectionConfirmed: bearishRejection || bullishRejection,
    sweepDetected: buySideSweep || sellSideSweep,
  });

  return {
    zone,
    type: getLiquidityType(buySideSweep, sellSideSweep, buySideZones.length, sellSideZones.length),
    buySideZones,
    sellSideZones,
    equalHighs,
    equalLows,
    sweepDetected: buySideSweep || sellSideSweep,
    stopHunt: falseBreakout && (bearishRejection || bullishRejection),
    falseBreakout,
    rejectionConfirmed: bearishRejection || bullishRejection,
    reversalAfterLiquidityGrab: (buySideSweep && bearishRejection) || (sellSideSweep && bullishRejection),
    realBreakoutContinuation,
    consolidationBeforeImpulse,
    longWick,
    activeSession,
    probableDirection,
    confidence,
    riskLevel,
    cautionMessage,
    reasons: buildReasons({
      activeSession,
      buySideContinuation,
      buySideSweep,
      consolidationBeforeImpulse,
      equalHighs: equalHighs.length,
      equalLows: equalLows.length,
      longWick,
      newsRisk,
      probableDirection,
      realBreakoutContinuation,
      rejectionConfirmed: bearishRejection || bullishRejection,
      sellSideContinuation,
      sellSideSweep,
    }),
  };
}

function detectZones(candles: Candle[], type: LiquidityZone["type"], tolerance: number): LiquidityZone[] {
  const zones: LiquidityZone[] = [];

  for (let index = 2; index < candles.length - 2; index += 1) {
    const candle = candles[index];
    const left = candles.slice(index - 2, index);
    const right = candles.slice(index + 1, index + 3);
    const price = type === "buy-side liquidity" ? candle.high : candle.low;
    const isSwing =
      type === "buy-side liquidity"
        ? left.every((item) => item.high <= candle.high) && right.every((item) => item.high <= candle.high)
        : left.every((item) => item.low >= candle.low) && right.every((item) => item.low >= candle.low);

    if (!isSwing) {
      continue;
    }

    const touches = candles.filter((item) => Math.abs((type === "buy-side liquidity" ? item.high : item.low) - price) <= tolerance).length;

    zones.push({
      price: round(price),
      type,
      strength: Math.min(5, Math.max(1, touches)),
      equalLevel: touches >= 2,
    });
  }

  return zones
    .sort((a, b) => b.strength - a.strength || Math.abs(candles.at(-1)!.close - a.price) - Math.abs(candles.at(-1)!.close - b.price))
    .slice(0, 5);
}

function detectRetestContinuation({
  candles,
  priorHigh,
  priorLow,
  tolerance,
}: {
  candles: Candle[];
  priorHigh: number;
  priorLow: number;
  tolerance: number;
}) {
  const last = candles.at(-1);
  const previous = candles.at(-2);

  if (!last || !previous) {
    return false;
  }

  const bullishRetest = previous.low <= priorHigh + tolerance && previous.close > priorHigh && last.close > previous.high;
  const bearishRetest = previous.high >= priorLow - tolerance && previous.close < priorLow && last.close < previous.low;

  return bullishRetest || bearishRetest;
}

function detectConsolidationBeforeImpulse(candles: Candle[], atr: number) {
  const last = candles.at(-1);
  const preImpulse = candles.slice(-10, -2);

  if (!last || preImpulse.length < 6) {
    return false;
  }

  const range = Math.max(...preImpulse.map((candle) => candle.high)) - Math.min(...preImpulse.map((candle) => candle.low));
  const impulseBody = Math.abs(last.close - last.open);

  return range <= atr * 2.2 && impulseBody >= atr * 0.8;
}

function getActiveSession(time: number): LiquidityAnalysis["activeSession"] {
  const hour = new Date(time * 1000).getUTCHours();
  const london = hour >= 7 && hour < 16;
  const newYork = hour >= 12 && hour < 21;

  if (london && newYork) {
    return "Overlap";
  }

  if (london) {
    return "London";
  }

  if (newYork) {
    return "New York";
  }

  return "Off session";
}

function getProbableDirection({
  buySideContinuation,
  buySideSweep,
  sellSideContinuation,
  sellSideSweep,
  bearishRejection,
  bullishRejection,
  realBreakoutContinuation,
}: {
  buySideContinuation: boolean;
  buySideSweep: boolean;
  sellSideContinuation: boolean;
  sellSideSweep: boolean;
  bearishRejection: boolean;
  bullishRejection: boolean;
  realBreakoutContinuation: boolean;
}): LiquidityDirection {
  if (buySideSweep && bearishRejection) {
    return "SELL";
  }

  if (sellSideSweep && bullishRejection) {
    return "BUY";
  }

  if (realBreakoutContinuation && buySideContinuation) {
    return "BUY";
  }

  if (realBreakoutContinuation && sellSideContinuation) {
    return "SELL";
  }

  return "Attendre";
}

function chooseActiveZone({
  buySideZones,
  sellSideZones,
  buySideSweep,
  sellSideSweep,
  probableDirection,
  price,
}: {
  buySideZones: LiquidityZone[];
  sellSideZones: LiquidityZone[];
  buySideSweep: boolean;
  sellSideSweep: boolean;
  probableDirection: LiquidityDirection;
  price: number;
}) {
  if (buySideSweep || probableDirection === "SELL") {
    return buySideZones[0] ?? null;
  }

  if (sellSideSweep || probableDirection === "BUY") {
    return sellSideZones[0] ?? null;
  }

  return [...buySideZones, ...sellSideZones].sort((a, b) => Math.abs(price - a.price) - Math.abs(price - b.price))[0] ?? null;
}

function scoreLiquidity({
  activeSession,
  consolidationBeforeImpulse,
  equalHighs,
  equalLows,
  falseBreakout,
  longWick,
  newsRisk,
  realBreakoutContinuation,
  rejectionConfirmed,
  sweepDetected,
}: {
  activeSession: LiquidityAnalysis["activeSession"];
  consolidationBeforeImpulse: boolean;
  equalHighs: number;
  equalLows: number;
  falseBreakout: boolean;
  longWick: boolean;
  newsRisk: boolean;
  realBreakoutContinuation: boolean;
  rejectionConfirmed: boolean;
  sweepDetected: boolean;
}) {
  const score =
    (sweepDetected ? 24 : 0) +
    (rejectionConfirmed ? 22 : 0) +
    (realBreakoutContinuation ? 18 : 0) +
    (equalHighs + equalLows > 0 ? 12 : 0) +
    (falseBreakout ? 8 : 0) +
    (longWick ? 8 : 0) +
    (consolidationBeforeImpulse ? 5 : 0) +
    (activeSession === "London" || activeSession === "New York" || activeSession === "Overlap" ? 5 : 0) -
    (newsRisk ? 10 : 0);

  return Math.max(0, Math.min(100, score));
}

function getLiquidityType(buySideSweep: boolean, sellSideSweep: boolean, buySideZones: number, sellSideZones: number): LiquidityAnalysis["type"] {
  if (buySideSweep && sellSideSweep) {
    return "mixed";
  }

  if (buySideSweep || buySideZones > sellSideZones) {
    return "buy-side liquidity";
  }

  if (sellSideSweep || sellSideZones > 0) {
    return "sell-side liquidity";
  }

  return "none";
}

function getCautionMessage({
  newsRisk,
  probableDirection,
  realBreakoutContinuation,
  rejectionConfirmed,
  sweepDetected,
}: {
  newsRisk: boolean;
  probableDirection: LiquidityDirection;
  realBreakoutContinuation: boolean;
  rejectionConfirmed: boolean;
  sweepDetected: boolean;
}) {
  if (newsRisk && sweepDetected) {
    return "Prudence: prise de liquidite proche d'une news USD importante, risque augmente.";
  }

  if (sweepDetected && !rejectionConfirmed) {
    return "Prudence: liquidite prise sans confirmation, attendre rejet, CHoCH/BOS ou retest.";
  }

  if (realBreakoutContinuation) {
    return "Cassure de liquidite avec continuation potentielle, attendre retest confirme.";
  }

  if (probableDirection !== "Attendre") {
    return "Liquidite prise avec rejet: probabilite directionnelle, confirmation obligatoire.";
  }

  return "Attendre: aucune prise de liquidite exploitable confirmee.";
}

function buildReasons({
  activeSession,
  buySideContinuation,
  buySideSweep,
  consolidationBeforeImpulse,
  equalHighs,
  equalLows,
  longWick,
  newsRisk,
  probableDirection,
  realBreakoutContinuation,
  rejectionConfirmed,
  sellSideContinuation,
  sellSideSweep,
}: {
  activeSession: LiquidityAnalysis["activeSession"];
  buySideContinuation: boolean;
  buySideSweep: boolean;
  consolidationBeforeImpulse: boolean;
  equalHighs: number;
  equalLows: number;
  longWick: boolean;
  newsRisk: boolean;
  probableDirection: LiquidityDirection;
  realBreakoutContinuation: boolean;
  rejectionConfirmed: boolean;
  sellSideContinuation: boolean;
  sellSideSweep: boolean;
}) {
  return [
    buySideSweep ? "Sweep au-dessus d'un ancien sommet: buy-side liquidity prise." : null,
    sellSideSweep ? "Sweep sous un ancien creux: sell-side liquidity prise." : null,
    rejectionConfirmed ? "Rejet confirme par meche longue et cloture retour structure." : "Pas encore de rejet confirme.",
    realBreakoutContinuation ? "Cassure reelle avec continuation/retest potentiel." : null,
    buySideContinuation ? "Continuation haussiere apres cassure buy-side." : null,
    sellSideContinuation ? "Continuation baissiere apres cassure sell-side." : null,
    equalHighs > 0 ? `${equalHighs} equal high(s) detecte(s).` : null,
    equalLows > 0 ? `${equalLows} equal low(s) detecte(s).` : null,
    longWick ? "Meche longue detectee: possible chasse aux stops." : null,
    consolidationBeforeImpulse ? "Consolidation avant impulsion detectee." : null,
    activeSession !== "Off session" ? `Session ${activeSession}: liquidite plus active.` : "Hors Londres/New York: liquidite moins fiable.",
    newsRisk ? "News USD proche: risque augmente." : null,
    `Direction probable: ${probableDirection}.`,
  ].filter(Boolean) as string[];
}

function emptyLiquidityAnalysis(newsRisk: boolean): LiquidityAnalysis {
  return {
    zone: null,
    type: "none",
    buySideZones: [],
    sellSideZones: [],
    equalHighs: [],
    equalLows: [],
    sweepDetected: false,
    stopHunt: false,
    falseBreakout: false,
    rejectionConfirmed: false,
    reversalAfterLiquidityGrab: false,
    realBreakoutContinuation: false,
    consolidationBeforeImpulse: false,
    longWick: false,
    activeSession: "Off session",
    probableDirection: "Attendre",
    confidence: 0,
    riskLevel: newsRisk ? "eleve" : "faible",
    cautionMessage: newsRisk ? "News USD proche: attendre confirmation." : "Donnees insuffisantes pour la liquidite.",
    reasons: [],
  };
}

function round(value: number) {
  return Number(value.toFixed(2));
}
