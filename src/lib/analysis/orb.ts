import type { Candle, Direction, OrbAnalysis, OrbDuration, OrbSession } from "@/types";

const sessions: Array<{ session: OrbSession; hour: number; minute: number }> = [
  { session: "London", hour: 8, minute: 0 },
  { session: "New York", hour: 13, minute: 30 },
];

export function detectOrbAnalysis({
  atr,
  candles,
  duration,
  newsSafe,
  requireRetest,
  spread,
}: {
  atr: number;
  candles: Candle[];
  duration: OrbDuration;
  newsSafe: boolean;
  requireRetest: boolean;
  spread: number | null;
}): OrbAnalysis | null {
  if (candles.length < 20) {
    return null;
  }

  const last = candles.at(-1);
  const previous = candles.at(-2);
  if (!last || !previous) {
    return null;
  }

  const sessionWindow = getLatestSessionWindow(last.time, duration);
  const rangeCandles = candles.filter((candle) => candle.time >= sessionWindow.startTime && candle.time < sessionWindow.endTime);

  if (!rangeCandles.length) {
    return null;
  }

  const high = Math.max(...rangeCandles.map((candle) => candle.high));
  const low = Math.min(...rangeCandles.map((candle) => candle.low));
  const afterRange = candles.filter((candle) => candle.time >= sessionWindow.endTime);
  const lastAfter = afterRange.at(-1);
  const breakoutBuy = Boolean(lastAfter && lastAfter.close > high);
  const breakoutSell = Boolean(lastAfter && lastAfter.close < low);
  const direction: Direction = breakoutBuy ? "Bullish" : breakoutSell ? "Bearish" : "Neutral";
  const breakoutCandle = afterRange.find((candle) => candle.close > high || candle.close < low) ?? null;
  const fakeBreakout = detectFakeBreakout({ afterRange, high, low });
  const retestConfirmed = detectRetest({ afterRange, direction, high, low });
  const momentumAligned = detectMomentum(afterRange, direction);
  const atrOk = atr > Math.max((last.close || 1) * 0.00016, 0.3);
  const spreadOk = spread === null || spread <= Math.max(0.45, atr * 0.28);
  const baseConfidence = clamp(
    (direction !== "Neutral" ? 32 : 0) +
      (momentumAligned ? 18 : 0) +
      (atrOk ? 12 : 0) +
      (spreadOk ? 10 : 0) +
      (retestConfirmed ? 16 : 0) +
      (newsSafe ? 12 : -30) -
      (fakeBreakout ? 35 : 0),
    100,
  );
  const status = getStatus({ breakoutBuy, breakoutSell, fakeBreakout, newsSafe });
  const rangeSize = Math.max(high - low, atr || 1);
  const entryZone = direction === "Bearish"
    ? { low: low - rangeSize * 0.15, high: low }
    : direction === "Bullish"
      ? { low: high, high: high + rangeSize * 0.15 }
      : { low, high };
  const stopLoss = direction === "Bearish" ? high + Math.max(atr * 0.4, rangeSize * 0.2) : low - Math.max(atr * 0.4, rangeSize * 0.2);
  const risk = direction === "Bearish" ? entryZone.high - stopLoss : entryZone.low - stopLoss;
  const riskAbs = Math.max(Math.abs(risk), rangeSize * 0.35);
  const takeProfits: [number, number] = direction === "Bearish"
    ? [entryZone.low - riskAbs, entryZone.low - riskAbs * 2]
    : [entryZone.high + riskAbs, entryZone.high + riskAbs * 2];

  return {
    atrOk,
    breakoutConfirmed: Boolean(direction !== "Neutral" && breakoutCandle),
    breakoutTime: breakoutCandle?.time ?? null,
    confidence: baseConfidence,
    direction,
    duration,
    endTime: sessionWindow.endTime,
    entryZone: roundZone(entryZone),
    fakeBreakout,
    high: round(high),
    invalidation: getInvalidation({ direction, high, low, newsSafe, status }),
    low: round(low),
    missingConfirmation: getMissingConfirmation({ atrOk, direction, fakeBreakout, momentumAligned, newsSafe, requireRetest, retestConfirmed, spreadOk }),
    momentumAligned,
    newsSafe,
    retestConfirmed,
    riskLevel: getRiskLevel({ confidence: baseConfidence, fakeBreakout, newsSafe, spreadOk }),
    session: sessionWindow.session,
    spreadOk,
    startTime: sessionWindow.startTime,
    status,
    stopLoss: round(stopLoss),
    takeProfits: takeProfits.map(round) as [number, number],
  };
}

function getLatestSessionWindow(time: number, duration: OrbDuration) {
  const date = new Date(time * 1000);
  const todayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000;
  const candidates = sessions
    .flatMap((session) => [-86_400, 0].map((offset) => {
      const startTime = todayStart + offset + session.hour * 3600 + session.minute * 60;
      return { ...session, endTime: startTime + duration * 60, startTime };
    }))
    .filter((candidate) => candidate.startTime <= time)
    .sort((a, b) => b.startTime - a.startTime);

  return candidates[0] ?? {
    session: "London" as OrbSession,
    startTime: todayStart + sessions[0].hour * 3600,
    endTime: todayStart + sessions[0].hour * 3600 + duration * 60,
  };
}

function getStatus({
  breakoutBuy,
  breakoutSell,
  fakeBreakout,
  newsSafe,
}: {
  breakoutBuy: boolean;
  breakoutSell: boolean;
  fakeBreakout: boolean;
  newsSafe: boolean;
}) {
  if (!newsSafe) {
    return "WAIT";
  }

  if (fakeBreakout) {
    return "ORB FAILED";
  }

  if (breakoutBuy) {
    return "ORB BREAKOUT WATCH";
  }

  if (breakoutSell) {
    return "ORB BREAKOUT WATCH";
  }

  return "FORMING";
}

function detectFakeBreakout({ afterRange, high, low }: { afterRange: Candle[]; high: number; low: number }) {
  if (afterRange.length < 2) {
    return false;
  }

  const last = afterRange.at(-1);
  if (!last) {
    return false;
  }

  const priorBuyBreak = afterRange.slice(0, -1).some((candle) => candle.close > high);
  const priorSellBreak = afterRange.slice(0, -1).some((candle) => candle.close < low);

  return (priorBuyBreak && last.close < high) || (priorSellBreak && last.close > low);
}

function detectRetest({ afterRange, direction, high, low }: { afterRange: Candle[]; direction: Direction; high: number; low: number }) {
  if (direction === "Neutral" || afterRange.length < 2) {
    return false;
  }

  const recent = afterRange.slice(-8);

  if (direction === "Bullish") {
    return recent.some((candle) => candle.low <= high && candle.close > high);
  }

  return recent.some((candle) => candle.high >= low && candle.close < low);
}

function detectMomentum(candles: Candle[], direction: Direction) {
  const recent = candles.slice(-3);
  if (recent.length < 2 || direction === "Neutral") {
    return false;
  }

  if (direction === "Bullish") {
    return recent.filter((candle) => candle.close > candle.open).length >= 2 && recent.at(-1)!.close > recent[0].close;
  }

  return recent.filter((candle) => candle.close < candle.open).length >= 2 && recent.at(-1)!.close < recent[0].close;
}

function getMissingConfirmation({
  atrOk,
  direction,
  fakeBreakout,
  momentumAligned,
  newsSafe,
  requireRetest,
  retestConfirmed,
  spreadOk,
}: {
  atrOk: boolean;
  direction: Direction;
  fakeBreakout: boolean;
  momentumAligned: boolean;
  newsSafe: boolean;
  requireRetest: boolean;
  retestConfirmed: boolean;
  spreadOk: boolean;
}) {
  if (!newsSafe) {
    return "Red USD news blocks ORB.";
  }

  if (fakeBreakout) {
    return "ORB failed: breakout returned inside range.";
  }

  if (direction === "Neutral") {
    return "Wait for candle close outside ORB high/low.";
  }

  if (requireRetest && !retestConfirmed) {
    return "Wait for ORB retest confirmation.";
  }

  if (!momentumAligned) {
    return "Wait for momentum to align with ORB breakout.";
  }

  if (!atrOk) {
    return "Wait for ATR to become tradable.";
  }

  if (!spreadOk) {
    return "Wait for spread to normalize.";
  }

  return "ORB confirmation present.";
}

function getInvalidation({ direction, high, low, newsSafe, status }: { direction: Direction; high: number; low: number; newsSafe: boolean; status: string }) {
  if (!newsSafe) {
    return "Invalid while red USD news risk is active.";
  }

  if (status === "ORB FAILED") {
    return "Invalid: fake breakout returned inside opening range.";
  }

  if (direction === "Bullish") {
    return `Invalid if candle closes back below ORB high ${round(high)}.`;
  }

  if (direction === "Bearish") {
    return `Invalid if candle closes back above ORB low ${round(low)}.`;
  }

  return "No ORB breakout yet.";
}

function getRiskLevel({ confidence, fakeBreakout, newsSafe, spreadOk }: { confidence: number; fakeBreakout: boolean; newsSafe: boolean; spreadOk: boolean }) {
  if (!newsSafe || fakeBreakout || !spreadOk) {
    return "eleve";
  }

  if (confidence < 65) {
    return "modere";
  }

  return "faible";
}

function roundZone(zone: { low: number; high: number }) {
  return { low: round(zone.low), high: round(zone.high) };
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function clamp(value: number, max: number) {
  return Math.max(0, Math.min(max, Math.round(value)));
}
