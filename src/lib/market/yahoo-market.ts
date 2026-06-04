import type { Candle, MarketTick, Timeframe } from "@/types";
import { getCandleOpenTime } from "@/lib/market/candle-engine";

const YAHOO_CHART_BASES = ["https://query1.finance.yahoo.com/v8/finance/chart", "https://query2.finance.yahoo.com/v8/finance/chart"];
const DEFAULT_SYMBOL = "GC=F";
const DEFAULT_LIMIT = 600;

type YahooInterval = "1m" | "5m" | "15m" | "30m" | "60m" | "1d";

interface YahooChartResult {
  meta?: {
    regularMarketPrice?: number;
    regularMarketTime?: number;
    currency?: string;
    symbol?: string;
  };
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      open?: Array<number | null>;
      high?: Array<number | null>;
      low?: Array<number | null>;
      close?: Array<number | null>;
      volume?: Array<number | null>;
    }>;
  };
}

export function getYahooGoldSymbol() {
  return process.env.YAHOO_GOLD_SYMBOL || DEFAULT_SYMBOL;
}

export function getYahooSourceLabel() {
  return `Yahoo Finance ${getYahooGoldSymbol()}`;
}

export async function fetchYahooGoldHistory(timeframe: Timeframe, limit = DEFAULT_LIMIT): Promise<Candle[]> {
  const result = await fetchYahooChart(getYahooInterval(timeframe), getYahooRange(timeframe));
  const candles = yahooResultToCandles(result);

  if (!candles.length) {
    throw new Error("Yahoo Finance ne renvoie aucune bougie GOLD exploitable.");
  }

  return aggregateCandles(candles, timeframe).slice(-limit);
}

export async function fetchYahooGoldTick(): Promise<MarketTick> {
  const result = await fetchYahooChart("1m", "1d");
  const candles = yahooResultToCandles(result);
  const latest = candles.at(-1);
  const price = result.meta?.regularMarketPrice ?? latest?.close;
  const time = result.meta?.regularMarketTime ?? latest?.time;

  if (!price || !time) {
    throw new Error("Yahoo Finance ne renvoie pas de tick GOLD exploitable.");
  }

  return {
    symbol: "XAUUSD",
    time,
    price,
    volume: latest?.volume ?? 0,
  };
}

async function fetchYahooChart(interval: YahooInterval, range: string): Promise<YahooChartResult> {
  let lastError: unknown = null;

  for (const base of YAHOO_CHART_BASES) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const url = new URL(`${base}/${encodeURIComponent(getYahooGoldSymbol())}`);
        url.searchParams.set("range", range);
        url.searchParams.set("interval", interval);
        url.searchParams.set("includePrePost", "true");

        const response = await fetch(url, {
          cache: "no-store",
          headers: {
            accept: "application/json",
            "user-agent": "Mozilla/5.0 StarGoldByTSR/1.0",
          },
        });

        if (!response.ok) {
          throw new Error(`Yahoo Finance a refuse la requete GOLD (${response.status}).`);
        }

        const payload = await response.json();
        const result = payload?.chart?.result?.[0] as YahooChartResult | undefined;
        const error = payload?.chart?.error;

        if (!result || error) {
          throw new Error(error?.description ?? "Yahoo Finance ne renvoie pas de donnees GOLD.");
        }

        return result;
      } catch (error) {
        lastError = error;
        await wait(300 + attempt * 500);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Yahoo Finance est indisponible.");
}

function yahooResultToCandles(result: YahooChartResult): Candle[] {
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];

  if (!quote) {
    return [];
  }

  return timestamps
    .map((time, index) => {
      const open = quote.open?.[index];
      const high = quote.high?.[index];
      const low = quote.low?.[index];
      const close = quote.close?.[index];

      if (![open, high, low, close].every((value) => typeof value === "number" && Number.isFinite(value))) {
        return null;
      }

      return {
        time,
        open,
        high,
        low,
        close,
        volume: quote.volume?.[index] ?? 0,
      };
    })
    .filter((item): item is Candle => Boolean(item))
    .sort((a, b) => a.time - b.time);
}

function getYahooInterval(timeframe: Timeframe): YahooInterval {
  if (timeframe === "M1") {
    return "1m";
  }

  if (timeframe === "M5") {
    return "5m";
  }

  if (timeframe === "M15") {
    return "15m";
  }

  if (timeframe === "M30") {
    return "30m";
  }

  if (timeframe === "D1") {
    return "1d";
  }

  return "60m";
}

function getYahooRange(timeframe: Timeframe) {
  if (timeframe === "M1") {
    return "5d";
  }

  if (timeframe === "M5" || timeframe === "M15" || timeframe === "M30") {
    return "1mo";
  }

  if (timeframe === "H1" || timeframe === "H4") {
    return "3mo";
  }

  return "2y";
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

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
