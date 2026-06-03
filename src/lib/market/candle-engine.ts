import type { Candle, MarketTick, Timeframe } from "@/types";
import { timeframeSeconds } from "@/lib/market/timeframes";

const MAX_CANDLES = 600;

export function normalizeTickTimeSeconds(value: unknown): number | null {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (value > 1_000_000_000_000) {
    return Math.floor(value / 1000);
  }

  return Math.floor(value);
}

export function getCandleOpenTime(timeSeconds: number, timeframe: Timeframe, serverOffsetMinutes: number) {
  const interval = timeframeSeconds[timeframe];
  const shift = serverOffsetMinutes * 60;

  return Math.floor((timeSeconds + shift) / interval) * interval - shift;
}

export function applyTickToCandles({
  candles,
  tick,
  timeframe,
  serverOffsetMinutes,
}: {
  candles: Candle[];
  tick: MarketTick;
  timeframe: Timeframe;
  serverOffsetMinutes: number;
}): Candle[] {
  const bucketTime = getCandleOpenTime(tick.time, timeframe, serverOffsetMinutes);
  const price = tick.price;
  const last = candles.at(-1);

  if (!last || bucketTime > last.time) {
    return [
      ...candles,
      {
        time: bucketTime,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: tick.volume ?? 0,
      },
    ].slice(-MAX_CANDLES);
  }

  if (bucketTime < last.time) {
    return candles;
  }

  const updated: Candle = {
    ...last,
    high: Math.max(last.high, price),
    low: Math.min(last.low, price),
    close: price,
    volume: last.volume + (tick.volume ?? 0),
  };

  return [...candles.slice(0, -1), updated];
}

export function normalizeHistoryCandles(payload: unknown): Candle[] {
  const rows = Array.isArray(payload)
    ? payload
    : typeof payload === "object" && payload && "candles" in payload && Array.isArray(payload.candles)
      ? payload.candles
      : [];

  return rows
    .map((row) => {
      if (!row || typeof row !== "object") {
        return null;
      }

      const source = row as Record<string, unknown>;
      const time = normalizeTickTimeSeconds(source.time ?? source.timestamp ?? source.t);
      const open = Number(source.open ?? source.o);
      const high = Number(source.high ?? source.h);
      const low = Number(source.low ?? source.l);
      const close = Number(source.close ?? source.c);
      const volume = Number(source.volume ?? source.v ?? 0);

      if (!time || ![open, high, low, close].every(Number.isFinite)) {
        return null;
      }

      return { time, open, high, low, close, volume };
    })
    .filter((item): item is Candle => Boolean(item))
    .sort((a, b) => a.time - b.time)
    .slice(-MAX_CANDLES);
}

export function normalizeProviderTick(payload: unknown): MarketTick | null {
  const source = unwrapTickPayload(payload);
  if (!source) {
    return null;
  }

  const time = normalizeTickTimeSeconds(source.time ?? source.timestamp ?? source.t ?? source.serverTime);
  const bid = toOptionalNumber(source.bid ?? source.b);
  const ask = toOptionalNumber(source.ask ?? source.a);
  const last = toOptionalNumber(source.last ?? source.l);
  const rawPrice = toOptionalNumber(source.price ?? source.p);
  const price = rawPrice ?? last ?? bid ?? (bid && ask ? (bid + ask) / 2 : null);

  if (!time || !price) {
    return null;
  }

  return {
    symbol: "XAUUSD",
    time,
    bid,
    ask,
    price,
    volume: toOptionalNumber(source.volume ?? source.v) ?? 0,
  };
}

function unwrapTickPayload(payload: unknown): Record<string, unknown> | null {
  if (typeof payload === "string") {
    try {
      return unwrapTickPayload(JSON.parse(payload));
    } catch {
      return null;
    }
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const source = payload as Record<string, unknown>;
  const nested = source.tick ?? source.data ?? source.payload;

  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }

  return source;
}

function toOptionalNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}
