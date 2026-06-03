import type { Candle, OrderBlockDirection, OrderBlockScoreBreakdown, OrderBlockStrength, OrderBlockZone, Trend } from "@/types";
import { calculateATR } from "@/lib/indicators";

const SWING_LOOKBACK = 18;
const SEARCH_WINDOW = 90;

export function detectOrderBlock({
  candles,
  higherTimeframeAligned = false,
  higherTimeframeTrend = "range",
  riskReward = 0,
  zoneMode = "body",
}: {
  candles: Candle[];
  higherTimeframeAligned?: boolean;
  higherTimeframeTrend?: Trend;
  riskReward?: number;
  zoneMode?: "body" | "full";
}): OrderBlockZone | null {
  if (candles.length < 40) {
    return null;
  }

  const atr = calculateATR(candles);
  const candidates: OrderBlockZone[] = [];
  const start = Math.max(SWING_LOOKBACK + 2, candles.length - SEARCH_WINDOW);

  for (let index = start; index < candles.length - 1; index += 1) {
    const candle = candles[index];
    const next = candles[index + 1];
    const bullish = buildCandidate({
      atr,
      breakIndex: index + 1,
      candles,
      direction: "bullish",
      displacementCandle: next,
      higherTimeframeAligned: isHigherTimeframeAligned("bullish", higherTimeframeTrend, higherTimeframeAligned),
      obCandle: candle,
      obIndex: index,
      riskReward,
      zoneMode,
    });
    const bearish = buildCandidate({
      atr,
      breakIndex: index + 1,
      candles,
      direction: "bearish",
      displacementCandle: next,
      higherTimeframeAligned: isHigherTimeframeAligned("bearish", higherTimeframeTrend, higherTimeframeAligned),
      obCandle: candle,
      obIndex: index,
      riskReward,
      zoneMode,
    });

    if (bullish) {
      candidates.push(bullish);
    }

    if (bearish) {
      candidates.push(bearish);
    }
  }

  return candidates
    .filter((candidate) => candidate.score >= 60)
    .sort((a, b) => b.score - a.score || b.originTime - a.originTime)[0] ?? null;
}

function isHigherTimeframeAligned(direction: OrderBlockDirection, trend: Trend, fallbackAligned: boolean) {
  if (trend === "range") {
    return fallbackAligned;
  }

  return direction === trend;
}

function buildCandidate({
  atr,
  breakIndex,
  candles,
  direction,
  displacementCandle,
  higherTimeframeAligned,
  obCandle,
  obIndex,
  riskReward,
  zoneMode,
}: {
  atr: number;
  breakIndex: number;
  candles: Candle[];
  direction: OrderBlockDirection;
  displacementCandle: Candle;
  higherTimeframeAligned: boolean;
  obCandle: Candle;
  obIndex: number;
  riskReward: number;
  zoneMode: "body" | "full";
}): OrderBlockZone | null {
  const bullish = direction === "bullish";
  const obIsOpposite = bullish ? obCandle.close < obCandle.open : obCandle.close > obCandle.open;

  if (!obIsOpposite) {
    return null;
  }

  const displacementBody = Math.abs(displacementCandle.close - displacementCandle.open);
  const displacementConfirmed = bullish
    ? displacementCandle.close > displacementCandle.open && displacementBody >= atr * 1.15
    : displacementCandle.close < displacementCandle.open && displacementBody >= atr * 1.15;

  if (!displacementConfirmed) {
    return null;
  }

  const previousSwing = getPreviousSwing(candles, obIndex, bullish ? "high" : "low");
  const bosConfirmed = bullish ? displacementCandle.close > previousSwing : displacementCandle.close < previousSwing;

  if (!bosConfirmed) {
    return null;
  }

  const zone = getZone(obCandle, direction, zoneMode);
  const afterBreak = candles.slice(breakIndex + 1);
  const retestCount = afterBreak.filter((candle) => candle.high >= zone.low && candle.low <= zone.high).length;
  const latest = candles.at(-1);
  const touched = Boolean(latest && latest.high >= zone.low && latest.low <= zone.high);
  const liquiditySweep = detectPreObLiquiditySweep(candles, obIndex, direction);
  const fvg = detectNearbyFvg(candles, obIndex, breakIndex, direction, atr);
  const atrQuality = getAtrQuality(atr, latest?.close ?? obCandle.close);
  const breakdown = scoreOrderBlock({
    atrQuality,
    bosConfirmed,
    displacementConfirmed,
    fvg: Boolean(fvg),
    higherTimeframeAligned,
    liquiditySweep,
    retestCount,
    riskReward,
  });
  const strength = getStrength(breakdown.total);

  return {
    direction,
    strength,
    score: breakdown.total,
    proximal: bullish ? zone.high : zone.low,
    distal: bullish ? zone.low : zone.high,
    low: zone.low,
    high: zone.high,
    originTime: obCandle.time,
    breakTime: displacementCandle.time,
    touched,
    retestCount,
    fresh: retestCount === 0,
    bosConfirmed,
    displacementConfirmed,
    liquiditySweep,
    fvg,
    riskReward,
    atrQuality,
    requiresExtraConfirmation: breakdown.total >= 60 && breakdown.total <= 75,
    reasons: buildReasons({
      atrQuality,
      bosConfirmed,
      direction,
      displacementConfirmed,
      fvg: Boolean(fvg),
      higherTimeframeAligned,
      liquiditySweep,
      retestCount,
      riskReward,
      touched,
    }),
    scoreBreakdown: breakdown,
  };
}

function getPreviousSwing(candles: Candle[], index: number, side: "high" | "low") {
  const segment = candles.slice(Math.max(0, index - SWING_LOOKBACK), index);

  if (!segment.length) {
    return side === "high" ? candles[index].high : candles[index].low;
  }

  return side === "high" ? Math.max(...segment.map((candle) => candle.high)) : Math.min(...segment.map((candle) => candle.low));
}

function getZone(candle: Candle, direction: OrderBlockDirection, zoneMode: "body" | "full") {
  if (zoneMode === "full") {
    return {
      low: round(candle.low),
      high: round(candle.high),
    };
  }

  if (direction === "bullish") {
    return {
      low: round(candle.low),
      high: round(candle.open),
    };
  }

  return {
    low: round(candle.open),
    high: round(candle.high),
  };
}

function detectPreObLiquiditySweep(candles: Candle[], index: number, direction: OrderBlockDirection) {
  const sweep = candles[index - 1];
  const prior = candles.slice(Math.max(0, index - 12), index - 1);

  if (!sweep || prior.length < 5) {
    return false;
  }

  const priorHigh = Math.max(...prior.map((candle) => candle.high));
  const priorLow = Math.min(...prior.map((candle) => candle.low));

  return direction === "bullish"
    ? sweep.low < priorLow && sweep.close > priorLow
    : sweep.high > priorHigh && sweep.close < priorHigh;
}

function detectNearbyFvg(candles: Candle[], obIndex: number, breakIndex: number, direction: OrderBlockDirection, atr: number) {
  const from = Math.max(1, obIndex - 1);
  const to = Math.min(candles.length - 1, breakIndex + 2);

  for (let index = from; index < to; index += 1) {
    const previous = candles[index - 1];
    const current = candles[index];

    if (direction === "bullish" && current.low > previous.high && current.low - previous.high >= atr * 0.15) {
      return { low: round(previous.high), high: round(current.low) };
    }

    if (direction === "bearish" && previous.low > current.high && previous.low - current.high >= atr * 0.15) {
      return { low: round(current.high), high: round(previous.low) };
    }
  }

  return null;
}

function scoreOrderBlock({
  atrQuality,
  bosConfirmed,
  displacementConfirmed,
  fvg,
  higherTimeframeAligned,
  liquiditySweep,
  retestCount,
  riskReward,
}: {
  atrQuality: "good" | "acceptable" | "poor";
  bosConfirmed: boolean;
  displacementConfirmed: boolean;
  fvg: boolean;
  higherTimeframeAligned: boolean;
  liquiditySweep: boolean;
  retestCount: number;
  riskReward: number;
}): OrderBlockScoreBreakdown {
  const breakdown = {
    bos: bosConfirmed ? 25 : 0,
    displacement: displacementConfirmed ? 20 : 0,
    trendAlignment: higherTimeframeAligned ? 15 : 0,
    liquiditySweep: liquiditySweep ? 10 : 0,
    freshness: retestCount === 0 ? 10 : retestCount === 1 ? 7 : retestCount === 2 ? 4 : 0,
    fvg: fvg ? 10 : 0,
    riskReward: riskReward >= 2 ? 5 : riskReward >= 1.5 ? 3 : 0,
    volatility: atrQuality === "good" ? 5 : atrQuality === "acceptable" ? 3 : 0,
    total: 0,
  };

  return {
    ...breakdown,
    total:
      breakdown.bos +
      breakdown.displacement +
      breakdown.trendAlignment +
      breakdown.liquiditySweep +
      breakdown.freshness +
      breakdown.fvg +
      breakdown.riskReward +
      breakdown.volatility,
  };
}

function getAtrQuality(atr: number, price: number): "good" | "acceptable" | "poor" {
  const atrPercent = price ? (atr / price) * 100 : 0;

  if (atrPercent >= 0.05 && atrPercent <= 0.18) {
    return "good";
  }

  if (atrPercent > 0 && atrPercent <= 0.28) {
    return "acceptable";
  }

  return "poor";
}

function getStrength(score: number): OrderBlockStrength {
  if (score > 75) {
    return "strong";
  }

  if (score >= 60) {
    return "medium";
  }

  if (score > 0) {
    return "weak";
  }

  return "ignored";
}

function buildReasons({
  atrQuality,
  bosConfirmed,
  direction,
  displacementConfirmed,
  fvg,
  higherTimeframeAligned,
  liquiditySweep,
  retestCount,
  riskReward,
  touched,
}: {
  atrQuality: "good" | "acceptable" | "poor";
  bosConfirmed: boolean;
  direction: OrderBlockDirection;
  displacementConfirmed: boolean;
  fvg: boolean;
  higherTimeframeAligned: boolean;
  liquiditySweep: boolean;
  retestCount: number;
  riskReward: number;
  touched: boolean;
}) {
  return [
    `${direction === "bullish" ? "Bullish" : "Bearish"} OB: ${bosConfirmed ? "BOS confirmé" : "BOS absent"}`,
    displacementConfirmed ? "Displacement fort après OB" : "Displacement insuffisant",
    higherTimeframeAligned ? "Tendance H1/H4 alignée" : "Tendance H1/H4 non alignée",
    liquiditySweep ? "Liquidity sweep avant OB" : "Pas de sweep avant OB",
    retestCount === 0 ? "Zone fraîche" : `${retestCount} retest(s) déjà observé(s)`,
    fvg ? "FVG/imbalance proche" : "Pas de FVG proche",
    riskReward >= 2 ? `RR favorable 1:${riskReward.toFixed(2)}` : `RR limité 1:${riskReward ? riskReward.toFixed(2) : "0.00"}`,
    `ATR ${atrQuality}`,
    touched ? "Prix revenu dans la zone : confirmation price action requise" : "Prix pas encore revenu dans la zone",
  ];
}

function round(value: number) {
  return Number(value.toFixed(2));
}
