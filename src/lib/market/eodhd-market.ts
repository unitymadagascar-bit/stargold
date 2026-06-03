import type { Candle, MarketTick, Timeframe } from "@/types";
import { getCandleOpenTime, normalizeHistoryCandles, normalizeProviderTick } from "@/lib/market/candle-engine";
import { timeframeSeconds } from "@/lib/market/timeframes";

const EODHD_API_BASE = "https://eodhd.com/api";
const EODHD_WS_BASE = "wss://ws.eodhistoricaldata.com/ws/forex";
const DEFAULT_REST_SYMBOL = "XAUUSD.FOREX";
const DEFAULT_WS_SYMBOL = "XAUUSD";
const DEFAULT_LIMIT = 600;

type IntradayInterval = "1m" | "5m" | "1h";

export function getEodhdRestSymbol() {
  return process.env.EODHD_XAUUSD_SYMBOL || DEFAULT_REST_SYMBOL;
}

export function getEodhdWsSymbol() {
  return process.env.EODHD_XAUUSD_WS_SYMBOL || DEFAULT_WS_SYMBOL;
}

export function getEodhdSourceLabel() {
  return "EODHD";
}

export function getEodhdWebSocketUrl() {
  const token = getEodhdToken();
  const url = new URL(EODHD_WS_BASE);
  url.searchParams.set("api_token", token);
  return url.toString();
}

export async function fetchEodhdHistory(timeframe: Timeframe, limit = DEFAULT_LIMIT): Promise<Candle[]> {
  if (timeframe === "D1") {
    return fetchDailyHistory(limit);
  }

  const interval = getBaseInterval(timeframe);
  const now = Math.floor(Date.now() / 1000);
  const from = now - timeframeSeconds[timeframe] * Math.max(limit * 3, limit + 80);
  const url = new URL(`${EODHD_API_BASE}/intraday/${encodeURIComponent(getEodhdRestSymbol())}`);
  url.searchParams.set("api_token", getEodhdToken());
  url.searchParams.set("fmt", "json");
  url.searchParams.set("interval", interval);
  url.searchParams.set("from", String(from));
  url.searchParams.set("to", String(now));

  const candles = normalizeHistoryCandles(await fetchEodhdJson(url));
  return aggregateCandles(candles, timeframe).slice(-limit);
}

export async function fetchEodhdTick(): Promise<MarketTick> {
  const url = new URL(`${EODHD_API_BASE}/real-time/${encodeURIComponent(getEodhdRestSymbol())}`);
  url.searchParams.set("api_token", getEodhdToken());
  url.searchParams.set("fmt", "json");

  const payload = await fetchEodhdJson(url);
  const tick = normalizeProviderTick(payload);

  if (!tick) {
    throw new Error("La reponse EODHD real-time ne contient pas de prix XAUUSD exploitable.");
  }

  return tick;
}

export function normalizeEodhdStreamTick(payload: unknown): MarketTick | null {
  return normalizeProviderTick(payload);
}

function getEodhdToken() {
  const token = process.env.EODHD_API_TOKEN;

  if (!token) {
    throw new Error("EODHD_API_TOKEN est manquant.");
  }

  return token;
}

async function fetchDailyHistory(limit: number) {
  const url = new URL(`${EODHD_API_BASE}/eod/${encodeURIComponent(getEodhdRestSymbol())}`);
  url.searchParams.set("api_token", getEodhdToken());
  url.searchParams.set("fmt", "json");
  url.searchParams.set("period", "d");

  return normalizeHistoryCandles(await fetchEodhdJson(url)).slice(-limit);
}

async function fetchEodhdJson(url: URL) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`EODHD a refuse la requete marche (${response.status}).`);
  }

  return response.json();
}

function getBaseInterval(timeframe: Timeframe): IntradayInterval {
  if (timeframe === "M1") {
    return "1m";
  }

  if (timeframe === "H1" || timeframe === "H4") {
    return "1h";
  }

  return "5m";
}

function aggregateCandles(candles: Candle[], timeframe: Timeframe): Candle[] {
  const buckets = new Map<number, Candle>();

  for (const candle of candles) {
    const time = getCandleOpenTime(candle.time, timeframe, 0);
    const current = buckets.get(time);

    if (!current) {
      buckets.set(time, { ...candle, time });
      continue;
    }

    buckets.set(time, {
      ...current,
      high: Math.max(current.high, candle.high),
      low: Math.min(current.low, candle.low),
      close: candle.close,
      volume: current.volume + candle.volume,
    });
  }

  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}
