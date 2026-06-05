import type { Candle, FvgAnalysis, FvgDirection, Timeframe } from "@/types";

export function detectFvgAnalysis(candles: Candle[], timeframe: Timeframe, options: { afterTime?: number | null; direction?: FvgDirection | null } = {}): FvgAnalysis | null {
  if (candles.length < 6 || !["M1", "M5", "M15"].includes(timeframe)) {
    return null;
  }

  const candidates: Array<FvgAnalysis & { index: number }> = [];

  for (let index = 2; index < candles.length; index += 1) {
    const first = candles[index - 2];
    const middle = candles[index - 1];
    const third = candles[index];
    const bullishGap = third.low > first.high;
    const bearishGap = third.high < first.low;

    if (!bullishGap && !bearishGap) {
      continue;
    }

    const direction: FvgDirection = bullishGap ? "bullish" : "bearish";
    if (options.direction && direction !== options.direction) {
      continue;
    }

    if (options.afterTime && third.time < options.afterTime) {
      continue;
    }

    const low = bullishGap ? first.high : third.high;
    const high = bullishGap ? third.low : first.low;
    const after = candles.slice(index + 1);
    const fillPercent = calculateFillPercent({ after, direction, high, low });
    const fillState = fillPercent >= 99 ? "full" : fillPercent > 0 ? "partial" : "fresh";
    const last = candles.at(-1);
    const touched = Boolean(last && rangesOverlap(last.low, last.high, low, high));
    const rejectionConfirmed = Boolean(last && detectRejection(last, direction, low, high));
    const gapSize = high - low;
    const body = Math.abs(middle.close - middle.open);
    const impulse = gapSize > 0 ? body / Math.max(gapSize, 0.01) : 0;
    const freshness = Math.max(0, 30 - (candles.length - 1 - index)) / 30;
    const score = clamp(
      25 +
        (fillState === "fresh" ? 25 : fillState === "partial" ? 12 : -35) +
        Math.min(22, impulse * 5) +
        (rejectionConfirmed ? 18 : 0) +
        Math.round(freshness * 15),
      100,
    );

    candidates.push({
      direction,
      fillPercent,
      fillState: fillState === "full" ? "invalid" : fillState,
      fresh: fillState === "fresh",
      high: Number(high.toFixed(2)),
      index,
      low: Number(low.toFixed(2)),
      missingConfirmation: getMissingConfirmation({ fillState, rejectionConfirmed, touched }),
      originTime: third.time,
      rejectionConfirmed,
      score,
      timeframe,
      touched,
    });
  }

  return candidates
    .sort((a, b) => b.originTime - a.originTime || b.score - a.score)
    .map(({ index: _index, ...candidate }) => candidate)[0] ?? null;
}

export function fvgDirectionMatches(direction: FvgDirection, bias: "Bullish" | "Bearish" | "Neutral") {
  return (direction === "bullish" && bias === "Bullish") || (direction === "bearish" && bias === "Bearish");
}

function calculateFillPercent({ after, direction, high, low }: { after: Candle[]; direction: FvgDirection; high: number; low: number }) {
  const size = Math.max(0.01, high - low);

  if (!after.length) {
    return 0;
  }

  if (direction === "bullish") {
    const deepest = Math.min(...after.map((candle) => candle.low));
    if (deepest >= high) {
      return 0;
    }
    return Math.round(Math.max(0, Math.min(100, ((high - deepest) / size) * 100)));
  }

  const highest = Math.max(...after.map((candle) => candle.high));
  if (highest <= low) {
    return 0;
  }
  return Math.round(Math.max(0, Math.min(100, ((highest - low) / size) * 100)));
}

function detectRejection(candle: Candle, direction: FvgDirection, low: number, high: number) {
  const body = Math.max(Math.abs(candle.close - candle.open), 0.01);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const touched = rangesOverlap(candle.low, candle.high, low, high);

  if (!touched) {
    return false;
  }

  if (direction === "bullish") {
    return lowerWick >= body * 0.9 && candle.close > candle.open && candle.close >= low;
  }

  return upperWick >= body * 0.9 && candle.close < candle.open && candle.close <= high;
}

function getMissingConfirmation({ fillState, rejectionConfirmed, touched }: { fillState: "fresh" | "partial" | "full"; rejectionConfirmed: boolean; touched: boolean }) {
  if (fillState === "full") {
    return "FVG fully filled/invalid.";
  }

  if (touched && !rejectionConfirmed) {
    return "FVG touched without rejection: WATCH only.";
  }

  if (!rejectionConfirmed) {
    return "Wait for rejection or micro BOS from FVG.";
  }

  return "FVG confirmation present.";
}

function rangesOverlap(aLow: number, aHigh: number, bLow: number, bHigh: number) {
  return aHigh >= bLow && aLow <= bHigh;
}

function clamp(value: number, max: number) {
  return Math.max(0, Math.min(max, Math.round(value)));
}
