import type { Candle, MarketTick, Timeframe } from "@/types";
import { normalizeHistoryCandles, normalizeProviderTick } from "@/lib/market/candle-engine";
import { timeframes } from "@/lib/market/timeframes";

const MAX_CANDLES = 800;
const STALE_TICK_MS = 10_000;
const STALE_HISTORY_MS = 90_000;
const REDIS_TICK_TTL_SECONDS = 120;
const REDIS_HISTORY_TTL_SECONDS = 900;
const REDIS_KEY_PREFIX = process.env.MT5_REDIS_KEY_PREFIX || "star-gold:mt5";
const SUPABASE_TICK_ID = process.env.SUPABASE_MT5_TICK_ID || "xauusd";
const SUPABASE_TICK_TABLE = process.env.SUPABASE_MT5_TICK_TABLE || "mt5_ticks";
const SUPABASE_HISTORY_TABLE = process.env.SUPABASE_MT5_HISTORY_TABLE || "mt5_candles";

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

interface Mt5RedisTickPayload {
  data: MarketTick;
  provider: string;
  symbol: string;
  updatedAt: string;
}

interface Mt5RedisHistoryPayload {
  data: Candle[];
  provider: string;
  symbol: string;
  timeframe: Timeframe;
  updatedAt: string;
}

export async function ingestMt5Payload(payload: unknown): Promise<Mt5MarketResult<Record<Timeframe, number>>> {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload MT5 invalide.");
  }

  const source = payload as Record<string, unknown>;
  const store = getStore();
  const tick = normalizeProviderTick(source.tick ?? source);
  const candlesPayload = source.candles;
  const changedHistories: Timeframe[] = [];

  if (tick) {
    store.lastTick = tick;
  }

  if (candlesPayload && typeof candlesPayload === "object") {
    for (const timeframe of timeframes) {
      const candles = normalizeHistoryCandles((candlesPayload as Mt5CandleMapPayload)[timeframe]);

      if (candles.length) {
        store.candleMap[timeframe] = candles.slice(-MAX_CANDLES);
        changedHistories.push(timeframe);
      }
    }
  }

  store.source = String(source.source ?? "MT5");
  store.symbol = String(source.symbol ?? source.brokerSymbol ?? "XAUUSD");
  store.updatedAt = new Date().toISOString();

  try {
    await persistStoreUpdate({ changedHistories, store, tick });
  } catch (error) {
    console.warn("MT5 cloud persistence failed", error);
  }

  return {
    data: getCounts(store.candleMap),
    provider: store.source,
    symbol: store.symbol,
    warning: null,
    updatedAt: store.updatedAt,
  };
}

export async function getMt5History(timeframe: Timeframe, limit: number): Promise<Mt5MarketResult<Candle[]> | null> {
  const store = getStore();
  const candles = store.candleMap[timeframe];

  if (candles.length && !isStale(store.updatedAt, STALE_HISTORY_MS)) {
    return {
      data: candles.slice(-limit),
      provider: store.source,
      symbol: store.symbol,
      warning: null,
      updatedAt: store.updatedAt,
    };
  }

  const persistedHistory = (await readSupabaseHistory(timeframe)) ?? (await readRedisJson<Mt5RedisHistoryPayload>(redisHistoryKey(timeframe)));

  if (!persistedHistory || !persistedHistory.data.length || isStale(persistedHistory.updatedAt, STALE_HISTORY_MS)) {
    return null;
  }

  return {
    data: persistedHistory.data.slice(-limit),
    provider: persistedHistory.provider,
    symbol: persistedHistory.symbol,
    warning: null,
    updatedAt: persistedHistory.updatedAt,
  };
}

export async function getMt5Tick(): Promise<Mt5MarketResult<MarketTick> | null> {
  const store = getStore();

  if (store.lastTick && !isStale(store.updatedAt, STALE_TICK_MS)) {
    return {
      data: store.lastTick,
      provider: store.source,
      symbol: store.symbol,
      warning: null,
      updatedAt: store.updatedAt,
    };
  }

  const persistedTick = (await readSupabaseTick()) ?? (await readRedisJson<Mt5RedisTickPayload>(redisTickKey()));

  if (!persistedTick || isStale(persistedTick.updatedAt, STALE_TICK_MS)) {
    return null;
  }

  return {
    data: persistedTick.data,
    provider: persistedTick.provider,
    symbol: persistedTick.symbol,
    warning: null,
    updatedAt: persistedTick.updatedAt,
  };
}

export async function getMt5Status() {
  const store = getStore();
  const persistedTick = (await readSupabaseTick()) ?? (await readRedisJson<Mt5RedisTickPayload>(redisTickKey()));
  const lastTick = store.lastTick && !isStale(store.updatedAt, STALE_TICK_MS) ? store.lastTick : (persistedTick?.data ?? store.lastTick);
  const updatedAt = store.lastTick && !isStale(store.updatedAt, STALE_TICK_MS) ? store.updatedAt : (persistedTick?.updatedAt ?? store.updatedAt);
  const source = persistedTick?.provider ?? store.source;
  const symbol = persistedTick?.symbol ?? store.symbol;
  const candleCounts = await getPersistedCounts(store.candleMap);

  return {
    connected: Boolean(lastTick && !isStale(updatedAt, STALE_TICK_MS)),
    persistence: getPersistenceMode(),
    source,
    symbol,
    updatedAt,
    candleCounts,
    lastTick,
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

async function persistStoreUpdate({ changedHistories, store, tick }: { changedHistories: Timeframe[]; store: Mt5BridgeStore; tick: MarketTick | null }) {
  if (!store.updatedAt) {
    return;
  }

  const writes: Array<Promise<void>> = [];

  if (tick) {
    writes.push(writeSupabaseTick({ data: tick, provider: store.source, symbol: store.symbol, updatedAt: store.updatedAt }));
    writes.push(
      writeRedisJson(
        redisTickKey(),
        {
          data: tick,
          provider: store.source,
          symbol: store.symbol,
          updatedAt: store.updatedAt,
        } satisfies Mt5RedisTickPayload,
        REDIS_TICK_TTL_SECONDS,
      ),
    );
  }

  for (const timeframe of changedHistories) {
    const historyPayload = {
      data: store.candleMap[timeframe],
      provider: store.source,
      symbol: store.symbol,
      timeframe,
      updatedAt: store.updatedAt,
    } satisfies Mt5RedisHistoryPayload;

    writes.push(writeSupabaseHistory(historyPayload));
    writes.push(
      writeRedisJson(
        redisHistoryKey(timeframe),
        historyPayload,
        REDIS_HISTORY_TTL_SECONDS,
      ),
    );
  }

  await Promise.all(writes);
}

async function getPersistedCounts(candleMap: Record<Timeframe, Candle[]>) {
  if (!isSupabaseConfigured() && !isRedisConfigured()) {
    return getCounts(candleMap);
  }

  const entries = await Promise.all(
    timeframes.map(async (timeframe) => {
      const persisted = (await readSupabaseHistory(timeframe)) ?? (await readRedisJson<Mt5RedisHistoryPayload>(redisHistoryKey(timeframe)));
      return [timeframe, persisted?.data.length ?? candleMap[timeframe].length] as const;
    }),
  );

  return entries.reduce(
    (accumulator, [timeframe, count]) => ({
      ...accumulator,
      [timeframe]: count,
    }),
    {} as Record<Timeframe, number>,
  );
}

function redisTickKey() {
  return `${REDIS_KEY_PREFIX}:tick`;
}

function redisHistoryKey(timeframe: Timeframe) {
  return `${REDIS_KEY_PREFIX}:history:${timeframe}`;
}

function isRedisConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getPersistenceMode() {
  if (isSupabaseConfigured()) {
    return "supabase";
  }

  if (isRedisConfigured()) {
    return "redis";
  }

  return "memory";
}

async function writeRedisJson(key: string, value: unknown, ttlSeconds: number) {
  if (!isRedisConfigured()) {
    return;
  }

  await redisCommand(["SET", key, JSON.stringify(value), "EX", String(ttlSeconds)]);
}

async function readRedisJson<T>(key: string): Promise<T | null> {
  if (!isRedisConfigured()) {
    return null;
  }

  const result = await redisCommand(["GET", key]);

  if (typeof result !== "string") {
    return null;
  }

  try {
    return JSON.parse(result) as T;
  } catch {
    return null;
  }
}

async function writeSupabaseTick(payload: Mt5RedisTickPayload) {
  if (!isSupabaseConfigured()) {
    return;
  }

  await supabaseRequest(`${SUPABASE_TICK_TABLE}?on_conflict=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      id: SUPABASE_TICK_ID,
      source: payload.provider,
      symbol: payload.symbol,
      tick: payload.data,
      updated_at: payload.updatedAt,
    }),
  });
}

async function writeSupabaseHistory(payload: Mt5RedisHistoryPayload) {
  if (!isSupabaseConfigured()) {
    return;
  }

  await supabaseRequest(`${SUPABASE_HISTORY_TABLE}?on_conflict=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      id: `${SUPABASE_TICK_ID}:${payload.timeframe}`,
      source: payload.provider,
      symbol: payload.symbol,
      timeframe: payload.timeframe,
      candles: payload.data,
      updated_at: payload.updatedAt,
    }),
  });
}

async function readSupabaseTick(): Promise<Mt5RedisTickPayload | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const rows = await supabaseRequest(`${SUPABASE_TICK_TABLE}?id=eq.${encodeURIComponent(SUPABASE_TICK_ID)}&select=source,symbol,tick,updated_at&limit=1`);
    const row = Array.isArray(rows) ? rows[0] : null;

    if (!row?.tick || !row?.updated_at) {
      return null;
    }

    return {
      data: row.tick as MarketTick,
      provider: String(row.source ?? "MT5"),
      symbol: String(row.symbol ?? "XAUUSD"),
      updatedAt: String(row.updated_at),
    };
  } catch {
    return null;
  }
}

async function readSupabaseHistory(timeframe: Timeframe): Promise<Mt5RedisHistoryPayload | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const rows = await supabaseRequest(`${SUPABASE_HISTORY_TABLE}?id=eq.${encodeURIComponent(`${SUPABASE_TICK_ID}:${timeframe}`)}&select=source,symbol,timeframe,candles,updated_at&limit=1`);
    const row = Array.isArray(rows) ? rows[0] : null;

    if (!Array.isArray(row?.candles) || !row?.updated_at) {
      return null;
    }

    return {
      data: row.candles as Candle[],
      provider: String(row.source ?? "MT5"),
      symbol: String(row.symbol ?? "XAUUSD"),
      timeframe,
      updatedAt: String(row.updated_at),
    };
  } catch {
    return null;
  }
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!baseUrl || !serviceRoleKey) {
    throw new Error("Supabase MT5 relay is not configured.");
  }

  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Supabase MT5 relay unavailable (${response.status}).`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function redisCommand(command: string[]) {
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Redis MT5 store unavailable (${response.status}).`);
  }

  const payload = await response.json();
  return payload?.result;
}
