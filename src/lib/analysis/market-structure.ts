import type {
  Candle,
  StructureState,
  SupportResistanceLevel,
  TechnicalAnalysis,
  Trend,
  VolatilityState,
} from "@/types";
import { detectLiquidityAnalysis } from "@/lib/analysis/liquidity";
import { detectOrderBlock } from "@/lib/analysis/order-blocks";
import { calculateATR, calculateEMA, calculateRSI, lastValue } from "@/lib/indicators";

function roundPrice(price: number): number {
  return Number(price.toFixed(2));
}

export function detectTrend(candles: Candle[]): Trend {
  const closes = candles.map((candle) => candle.close);
  const ema50 = lastValue(calculateEMA(closes, 50), closes.at(-1) ?? 0);
  const ema200 = lastValue(calculateEMA(closes, 200), ema50);
  const price = closes.at(-1) ?? ema50;

  if (price > ema200 && ema50 > ema200) {
    return "bullish";
  }

  if (price < ema200 && ema50 < ema200) {
    return "bearish";
  }

  return "range";
}

export function detectStructure(candles: Candle[]): StructureState {
  const recent = candles.slice(-24);
  if (recent.length < 6) {
    return "range";
  }

  const previousHigh = Math.max(...recent.slice(0, -4).map((candle) => candle.high));
  const previousLow = Math.min(...recent.slice(0, -4).map((candle) => candle.low));
  const last = recent.at(-1);
  const beforeLast = recent.at(-2);

  if (!last || !beforeLast) {
    return "range";
  }

  if (last.close > previousHigh) {
    return "BOS";
  }

  if (last.close < previousLow) {
    return "CHoCH";
  }

  const higherHigh = last.high > beforeLast.high;
  const higherLow = last.low > beforeLast.low;
  const lowerHigh = last.high < beforeLast.high;
  const lowerLow = last.low < beforeLast.low;

  if (higherHigh && higherLow) {
    return "bullish";
  }

  if (lowerHigh && lowerLow) {
    return "bearish";
  }

  return "range";
}

export function detectSupportResistance(candles: Candle[]): SupportResistanceLevel[] {
  const recent = candles.slice(-80);
  const levels: SupportResistanceLevel[] = [];

  for (let index = 2; index < recent.length - 2; index += 1) {
    const candle = recent[index];
    const left = recent.slice(index - 2, index);
    const right = recent.slice(index + 1, index + 3);

    if (left.every((item) => item.low > candle.low) && right.every((item) => item.low > candle.low)) {
      levels.push({ price: roundPrice(candle.low), type: "support", strength: 1 });
    }

    if (left.every((item) => item.high < candle.high) && right.every((item) => item.high < candle.high)) {
      levels.push({ price: roundPrice(candle.high), type: "resistance", strength: 1 });
    }
  }

  return levels
    .sort((a, b) => b.strength - a.strength)
    .slice(-10);
}

export function detectBreakoutFakeout(candles: Candle[], support: number, resistance: number) {
  const last = candles.at(-1);
  const previous = candles.at(-2);

  if (!last || !previous) {
    return { breakout: false, fakeout: false };
  }

  const bullishBreakout = previous.close <= resistance && last.close > resistance;
  const bearishBreakout = previous.close >= support && last.close < support;
  const fakeout =
    (last.high > resistance && last.close < resistance) ||
    (last.low < support && last.close > support);

  return { breakout: bullishBreakout || bearishBreakout, fakeout };
}

export function detectLiquiditySweep(candles: Candle[]): boolean {
  const recent = candles.slice(-16);
  const last = recent.at(-1);

  if (!last || recent.length < 8) {
    return false;
  }

  const previousHigh = Math.max(...recent.slice(0, -1).map((candle) => candle.high));
  const previousLow = Math.min(...recent.slice(0, -1).map((candle) => candle.low));

  return (last.high > previousHigh && last.close < previousHigh) || (last.low < previousLow && last.close > previousLow);
}

export function classifyVolatility(candles: Candle[], atr: number): VolatilityState {
  const price = candles.at(-1)?.close ?? 1;
  const atrPercent = (atr / price) * 100;

  if (atrPercent < 0.05) {
    return "calme";
  }

  if (atrPercent < 0.13) {
    return "normale";
  }

  if (atrPercent < 0.24) {
    return "volatile";
  }

  return "trop dangereuse";
}

export function analyzeCandles(candles: Candle[]): TechnicalAnalysis {
  const closes = candles.map((candle) => candle.close);
  const ema20 = lastValue(calculateEMA(closes, 20));
  const ema50 = lastValue(calculateEMA(closes, 50));
  const ema200 = lastValue(calculateEMA(closes, 200));
  const levels = detectSupportResistance(candles);
  const price = candles.at(-1)?.close ?? 0;
  const support = levels
    .filter((level) => level.type === "support" && level.price <= price)
    .sort((a, b) => b.price - a.price)[0]?.price ?? roundPrice(price - 8);
  const resistance = levels
    .filter((level) => level.type === "resistance" && level.price >= price)
    .sort((a, b) => a.price - b.price)[0]?.price ?? roundPrice(price + 8);
  const { breakout, fakeout } = detectBreakoutFakeout(candles, support, resistance);
  const atr = calculateATR(candles);
  const last = candles.at(-1);
  const previous = candles.at(-2);
  const displacement = Boolean(last && previous && Math.abs(last.close - last.open) > atr * 0.8);
  const liquidity = detectLiquidityAnalysis(candles);

  return {
    trend: detectTrend(candles),
    structure: detectStructure(candles),
    rsi: Number(calculateRSI(closes).toFixed(1)),
    atr: Number(atr.toFixed(2)),
    ema20: roundPrice(ema20),
    ema50: roundPrice(ema50),
    ema200: roundPrice(ema200),
    support,
    resistance,
    breakout,
    fakeout,
    liquiditySweep: detectLiquiditySweep(candles) || liquidity.sweepDetected,
    retestConfirmed: Boolean(last && Math.abs(last.close - support) < atr * 0.7 && last.close > last.open),
    volatility: classifyVolatility(candles, atr),
    orderBlock: detectOrderBlock({ candles }),
    liquidity,
    fvg: last && previous && Math.abs(last.low - previous.high) > atr * 0.25 ? { low: previous.high, high: last.low } : null,
    fvgAnalysis: null,
    orb: null,
    trendFilter: null,
    displacement,
  };
}
