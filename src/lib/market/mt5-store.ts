import type { Candle, MarketTick, Timeframe } from "@/types";
import { normalizeHistoryCandles, normalizeProviderTick } from "@/lib/market/candle-engine";
import { timeframes } from "@/lib/market/timeframes";

const MAX_CANDLES = 800;
const STALE_TICK_MS = 20_000;
const STALE_HISTORY_MS = 90_000;

type Mt5CandleMapPayload = Partial<Record<Timeframe, unknown>>;

interface Mt5BridgeStore {
  candleMap: Record<Timeframe, Candle[]>;
  lastTick: MarketTick | null;
  source: string;
  symbol: string;
  updatedAt: string | null;
}

interface Mt5BridgeGlobal {
  __tradetsrMt5Store?: Mt5BridgeStore;
}

export interface Mt5MarketResult<T> {
  data: T;
  provider: string;
  symbol: string;
  warning: string | null;
  updatedAt: string | null;
}

export function ingestMt5Payload(payload: unknown): Mt5MarketResult<Record<Timeframe, number>> {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload MT5 invalide.");
  }

  const source = payload as Record<string, unknown>;
  const store = getStore();
  const tick = normalizeProviderTick(source.tick ?? source);
  const candlesPayload = source.candles;

  if (tick) {
    store.lastTick = tick;
  }

  if (candlesPayload && typeof candlesPayload === "object") {
    for (const timeframe of timeframes) {
      const candles = normalizeHistoryCandles((candlesPayload as Mt5CandleMapPayload)[timeframe]);

      if (candles.length) {
        store.candleMap[timeframe] = candles.slice(-MAX_CANDLES);
      }
    }
  }

  store.source = String(source.source ?? "MT5");
  store.symbol = String(source.symbol ?? source.brokerSymbol ?? "XAUUSD");
  store.updatedAt = new Date().toISOString();

  return {
    data: getCounts(store.candleMap),
    provider: store.source,
    symbol: store.symbol,
    warning: null,
    updatedAt: store.updatedAt,
  };
}

export function getMt5History(timeframe: Timeframe, limit: number): Mt5MarketResult<Candle[]> | null {
  const store = getStore();
  const candles = store.candleMap[timeframe];

  if (!candles.length || isStale(store.updatedAt, STALE_HISTORY_MS)) {
    return null;
  }

  return {
    data: candles.slice(-limit),
    provider: store.source,
    symbol: store.symbol,
    warning: null,
    updatedAt: store.updatedAt,
  };
}

export function getMt5Tick(): Mt5MarketResult<MarketTick> | null {
  const store = getStore();

  if (!store.lastTick || isStale(store.updatedAt, STALE_TICK_MS)) {
    return null;
  }

  return {
    data: store.lastTick,
    provider: store.source,
    symbol: store.symbol,
    warning: null,
    updatedAt: store.updatedAt,
  };
}

export function getMt5Status() {
  const store = getStore();

  return {
    connected: Boolean(store.lastTick && !isStale(store.updatedAt, STALE_TICK_MS)),
    source: store.source,
    symbol: store.symbol,
    updatedAt: store.updatedAt,
    candleCounts: getCounts(store.candleMap),
    lastTick: store.lastTick,
  };
}

function getStore() {
  const globalStore = globalThis as Mt5BridgeGlobal;

  if (!globalStore.__tradetsrMt5Store) {
    globalStore.__tradetsrMt5Store = {
      candleMap: timeframes.reduce(
        (accumulator, timeframe) => ({
          ...accumulator,
          [timeframe]: [],
        }),
        {} as Record<Timeframe, Candle[]>,
      ),
      lastTick: null,
      source: "MT5",
      symbol: "XAUUSD",
      updatedAt: null,
    };
  }

  return globalStore.__tradetsrMt5Store;
}

function getCounts(candleMap: Record<Timeframe, Candle[]>) {
  return timeframes.reduce(
    (accumulator, timeframe) => ({
      ...accumulator,
      [timeframe]: candleMap[timeframe].length,
    }),
    {} as Record<Timeframe, number>,
  );
}

function isStale(updatedAt: string | null, maxAgeMs: number) {
  if (!updatedAt) {
    return true;
  }

  return Date.now() - Date.parse(updatedAt) > maxAgeMs;
}
