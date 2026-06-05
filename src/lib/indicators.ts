import type { Candle } from "@/types";

export function calculateEMA(values: number[], period: number): number[] {
  if (values.length === 0) {
    return [];
  }

  const multiplier = 2 / (period + 1);
  const ema: number[] = [values[0]];

  for (let index = 1; index < values.length; index += 1) {
    ema.push((values[index] - ema[index - 1]) * multiplier + ema[index - 1]);
  }

  return ema;
}

export function calculateSMA(values: number[], period: number): number[] {
  if (!values.length) {
    return [];
  }

  return values.map((_, index) => {
    const slice = values.slice(Math.max(0, index - period + 1), index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });
}

export function calculateRSI(values: number[], period = 14): number {
  if (values.length <= period) {
    return 50;
  }

  let gains = 0;
  let losses = 0;
  const slice = values.slice(-period - 1);

  for (let index = 1; index < slice.length; index += 1) {
    const change = slice[index] - slice[index - 1];
    if (change >= 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  if (losses === 0) {
    return 100;
  }

  const relativeStrength = gains / losses;
  return 100 - 100 / (1 + relativeStrength);
}

export function calculateATR(candles: Candle[], period = 14): number {
  if (candles.length <= period) {
    return 0;
  }

  const trueRanges = candles.slice(1).map((candle, index) => {
    const previousClose = candles[index].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });

  const recentRanges = trueRanges.slice(-period);
  return recentRanges.reduce((sum, range) => sum + range, 0) / recentRanges.length;
}

export function lastValue(values: number[], fallback = 0): number {
  return values.length ? values[values.length - 1] : fallback;
}
