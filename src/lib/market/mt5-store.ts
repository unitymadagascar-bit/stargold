import type { Candle, MarketTick, Timeframe } from "@/types";
import { normalizeHistoryCandles, normalizeProviderTick } from "@/lib/market/candle-engine";
import { timeframes } from "@/lib/market/timeframes";
import { normalizeSymbol } from "@/lib/symbols/profiles";

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
  brokerSymbol: string;
  candleMap: Record<Timeframe, Candle[]>;
  lastTick: MarketTick | null;
  source: string;
  symbol: string;
  updatedAt: string | null;
}

interface Mt5BridgeGlobal {
  __tradetsrMt5Store?: Mt5BridgeStore;
  __tradetsrMt5Stores?: Record<string, Mt5BridgeStore>;
}

export interface Mt5MarketResult<T> {
  brokerSymbol?: string;
  data: T;
  provider: string;
  symbol: string;
  warning: string | null;
  updatedAt: string | null;
}

interface Mt5RedisTickPayload {
  brokerSymbol?: string;
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
  const tick = normalizeProviderTick(source.tick ?? source);
  const rawSymbol = String(source.brokerSymbol ?? source.symbol ?? tick?.symbol ?? "XAUUSD");
  const symbol = normalizeBridgeSymbol(rawSymbol);
  const store = getStore(symbol);
  const candlesPayload = source.candles;
  const changedHistories: Timeframe[] = [];

  if (tick) {
    store.lastTick = { ...tick, symbol: normalizeSymbol(rawSymbol) };
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
  store.brokerSymbol = normalizeSymbol(rawSymbol);
  store.symbol = symbol;
  store.updatedAt = new Date().toISOString();

  try {
    await persistStoreUpdate({ changedHistories, store, tick });
  } catch (error) {
    console.warn("MT5 cloud persistence failed", error);
  }

  return {
    brokerSymbol: store.brokerSymbol,
    data: getCounts(store.candleMap),
    provider: store.source,
    symbol: store.symbol,
    warning: null,
    updatedAt: store.updatedAt,
  };
}

export async function getMt5History(timeframe: Timeframe, limit: number, symbol = "XAUUSD"): Promise<Mt5MarketResult<Candle[]> | null> {
  const normalizedSymbol = normalizeBridgeSymbol(symbol);
  const store = getStore(normalizedSymbol);
  const candles = store.candleMap[timeframe];

  if (candles.length && !isStale(store.updatedAt, STALE_HISTORY_MS)) {
    return {
      brokerSymbol: store.brokerSymbol,
      data: candles.slice(-limit),
      provider: store.source,
      symbol: store.symbol,
      warning: null,
      updatedAt: store.updatedAt,
    };
  }

  const persistedHistory = (await readSupabaseHistory(timeframe, normalizedSymbol)) ?? (await readRedisJson<Mt5RedisHistoryPayload>(redisHistoryKey(timeframe, normalizedSymbol)));

  if (!persistedHistory || !persistedHistory.data.length || isStale(persistedHistory.updatedAt, STALE_HISTORY_MS)) {
    return null;
  }

  return {
    brokerSymbol: persistedHistory.symbol,
    data: persistedHistory.data.slice(-limit),
    provider: persistedHistory.provider,
    symbol: persistedHistory.symbol,
    warning: null,
    updatedAt: persistedHistory.updatedAt,
  };
}

export async function getMt5Tick(symbol = "XAUUSD"): Promise<Mt5MarketResult<MarketTick> | null> {
  const normalizedSymbol = normalizeBridgeSymbol(symbol);
  const store = getStore(normalizedSymbol);

  if (store.lastTick && !isStale(store.updatedAt, STALE_TICK_MS)) {
    return {
      brokerSymbol: store.brokerSymbol,
      data: store.lastTick,
      provider: store.source,
      symbol: store.symbol,
      warning: null,
      updatedAt: store.updatedAt,
    };
  }

  const persistedTick = (await readSupabaseTick(normalizedSymbol)) ?? (await readRedisJson<Mt5RedisTickPayload>(redisTickKey(normalizedSymbol)));

  if (!persistedTick || isStale(persistedTick.updatedAt, STALE_TICK_MS)) {
    return null;
  }

  return {
    brokerSymbol: persistedTick.brokerSymbol ?? persistedTick.symbol,
    data: persistedTick.data,
    provider: persistedTick.provider,
    symbol: persistedTick.symbol,
    warning: null,
    updatedAt: persistedTick.updatedAt,
  };
}

export async function getMt5Status(symbol = "XAUUSD") {
  const normalizedSymbol = normalizeBridgeSymbol(symbol);
  const store = getStore(normalizedSymbol);
  const persistedTick = (await readSupabaseTick(normalizedSymbol)) ?? (await readRedisJson<Mt5RedisTickPayload>(redisTickKey(normalizedSymbol)));
  const lastTick = store.lastTick && !isStale(store.updatedAt, STALE_TICK_MS) ? store.lastTick : (persistedTick?.data ?? store.lastTick);
  const updatedAt = store.lastTick && !isStale(store.updatedAt, STALE_TICK_MS) ? store.updatedAt : (persistedTick?.updatedAt ?? store.updatedAt);
  const source = persistedTick?.provider ?? store.source;
  const responseSymbol = persistedTick?.symbol ?? store.symbol;
  const brokerSymbol = persistedTick?.brokerSymbol ?? store.brokerSymbol ?? responseSymbol;
  const candleCounts = await getPersistedCounts(store.candleMap, normalizedSymbol);

  return {
    connected: Boolean(lastTick && !isStale(updatedAt, STALE_TICK_MS)),
    persistence: getPersistenceMode(),
    brokerSymbol,
    source,
    symbol: responseSymbol,
    updatedAt,
    candleCounts,
    lastTick,
  };
}

function getStore(symbol = "XAUUSD") {
  const globalStore = globalThis as Mt5BridgeGlobal;
  const normalizedSymbol = normalizeBridgeSymbol(symbol);

  if (!globalStore.__tradetsrMt5Stores) {
    globalStore.__tradetsrMt5Stores = {};
  }

  if (!globalStore.__tradetsrMt5Stores[normalizedSymbol]) {
    globalStore.__tradetsrMt5Stores[normalizedSymbol] = {
      brokerSymbol: normalizedSymbol,
      candleMap: timeframes.reduce(
        (accumulator, timeframe) => ({
          ...accumulator,
          [timeframe]: [],
        }),
        {} as Record<Timeframe, Candle[]>,
      ),
      lastTick: null,
      source: "MT5",
      symbol: normalizedSymbol,
      updatedAt: null,
    };

    if (normalizedSymbol === "XAUUSD") {
      globalStore.__tradetsrMt5Store = globalStore.__tradetsrMt5Stores[normalizedSymbol];
    }
  }

  return globalStore.__tradetsrMt5Stores[normalizedSymbol];
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
        redisTickKey(store.symbol),
        {
          brokerSymbol: store.brokerSymbol,
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
        redisHistoryKey(timeframe, store.symbol),
        historyPayload,
        REDIS_HISTORY_TTL_SECONDS,
      ),
    );
  }

  await Promise.all(writes);
}

async function getPersistedCounts(candleMap: Record<Timeframe, Candle[]>, symbol: string) {
  if (!isSupabaseConfigured() && !isRedisConfigured()) {
    return getCounts(candleMap);
  }

  const entries = await Promise.all(
    timeframes.map(async (timeframe) => {
      const persisted = (await readSupabaseHistory(timeframe, symbol)) ?? (await readRedisJson<Mt5RedisHistoryPayload>(redisHistoryKey(timeframe, symbol)));
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

function redisTickKey(symbol = "XAUUSD") {
  return `${REDIS_KEY_PREFIX}:${storageId(symbol)}:tick`;
}

function redisHistoryKey(timeframe: Timeframe, symbol = "XAUUSD") {
  return `${REDIS_KEY_PREFIX}:${storageId(symbol)}:history:${timeframe}`;
}

function storageId(symbol: string) {
  const normalized = normalizeBridgeSymbol(symbol);
  return normalized === "XAUUSD" ? SUPABASE_TICK_ID : normalized.toLowerCase();
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
      id: storageId(payload.symbol),
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
      id: `${storageId(payload.symbol)}:${payload.timeframe}`,
      source: payload.provider,
      symbol: payload.symbol,
      timeframe: payload.timeframe,
      candles: payload.data,
      updated_at: payload.updatedAt,
    }),
  });
}

async function readSupabaseTick(symbol = "XAUUSD"): Promise<Mt5RedisTickPayload | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const rows = await supabaseRequest(`${SUPABASE_TICK_TABLE}?id=eq.${encodeURIComponent(storageId(symbol))}&select=source,symbol,tick,updated_at&limit=1`);
    const row = Array.isArray(rows) ? rows[0] : null;

    if (!row?.tick || !row?.updated_at) {
      return null;
    }

    const tick = row.tick as MarketTick;

    return {
      data: tick,
      brokerSymbol: String(tick.symbol ?? row.symbol ?? "XAUUSD"),
      provider: String(row.source ?? "MT5"),
      symbol: String(row.symbol ?? "XAUUSD"),
      updatedAt: String(row.updated_at),
    };
  } catch {
    return null;
  }
}

function normalizeBridgeSymbol(symbol: string) {
  const normalized = normalizeSymbol(symbol);
  const knownBase = [
    "XAUUSD",
    "XAGUSD",
    "BTCUSD",
    "ETHUSD",
    "EURUSD",
    "GBPUSD",
    "USDJPY",
    "US30",
    "NAS100",
    "SPX500",
    "USOIL",
    "UKOIL",
    "AMZN",
    "TSLA",
    "AAPL",
    "NVDA",
    "MSFT",
    "META",
    "GOOGL",
  ].sort((a, b) => b.length - a.length);
  const match = knownBase.find((base) => normalized === base || normalized.startsWith(base));
  return match ?? normalized;
}

async function readSupabaseHistory(timeframe: Timeframe, symbol = "XAUUSD"): Promise<Mt5RedisHistoryPayload | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const rows = await supabaseRequest(`${SUPABASE_HISTORY_TABLE}?id=eq.${encodeURIComponent(`${storageId(symbol)}:${timeframe}`)}&select=source,symbol,timeframe,candles,updated_at&limit=1`);
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
