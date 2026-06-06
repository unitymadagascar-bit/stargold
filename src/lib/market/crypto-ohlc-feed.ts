import type { Candle, MarketTick, Timeframe } from "@/types";

const BINANCE_PUBLIC_DATA_BASE_URLS = [
  process.env.CRYPTO_OHLC_API_BASE_URL,
  "https://data-api.binance.vision",
  "https://api.binance.com",
].filter(Boolean) as string[];

const intervalByTimeframe: Record<Timeframe, string> = {
  M1: "1m",
  M5: "5m",
  M15: "15m",
  M30: "30m",
  H1: "1h",
  H4: "4h",
  D1: "1d",
};

export function getCryptoFeedSymbol(symbol: string) {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (normalized === "BTCUSD" || normalized === "BTCUSDT") {
    return "BTCUSDT";
  }

  if (normalized === "ETHUSD" || normalized === "ETHUSDT") {
    return "ETHUSDT";
  }

  return null;
}

export function getCryptoOhlcSourceLabel() {
  return "Crypto OHLC Feed";
}

export async function fetchCryptoOhlcHistory(timeframe: Timeframe, limit: number, symbol: string): Promise<Candle[]> {
  const feedSymbol = getCryptoFeedSymbol(symbol);

  if (!feedSymbol) {
    throw new Error(`CryptoOHLCFeed ne supporte pas ${symbol}.`);
  }

  const payload = await fetchFirstBinanceJson(`/api/v3/klines?symbol=${feedSymbol}&interval=${intervalByTimeframe[timeframe]}&limit=${clampLimit(limit)}`);

  if (!Array.isArray(payload)) {
    throw new Error("CryptoOHLCFeed: reponse klines invalide.");
  }

  return payload
    .map((row): Candle | null => {
      if (!Array.isArray(row) || row.length < 6) {
        return null;
      }

      const time = Math.floor(Number(row[0]) / 1000);
      const open = Number(row[1]);
      const high = Number(row[2]);
      const low = Number(row[3]);
      const close = Number(row[4]);
      const volume = Number(row[5]);

      if (!time || ![open, high, low, close, volume].every(Number.isFinite)) {
        return null;
      }

      return { time, open, high, low, close, volume };
    })
    .filter((item): item is Candle => Boolean(item))
    .sort((a, b) => a.time - b.time);
}

export async function fetchCryptoOhlcTick(symbol: string): Promise<MarketTick> {
  const feedSymbol = getCryptoFeedSymbol(symbol);

  if (!feedSymbol) {
    throw new Error(`CryptoOHLCFeed ne supporte pas ${symbol}.`);
  }

  const payload = await fetchFirstBinanceJson(`/api/v3/ticker/bookTicker?symbol=${feedSymbol}`);

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("CryptoOHLCFeed: reponse ticker invalide.");
  }

  const source = payload as Record<string, unknown>;
  const bid = Number(source.bidPrice);
  const ask = Number(source.askPrice);
  const price = Number.isFinite(bid) && Number.isFinite(ask) ? (bid + ask) / 2 : Number(source.price);

  if (!Number.isFinite(price)) {
    throw new Error("CryptoOHLCFeed: prix ticker indisponible.");
  }

  return {
    symbol: feedSymbol,
    time: Math.floor(Date.now() / 1000),
    bid: Number.isFinite(bid) ? bid : undefined,
    ask: Number.isFinite(ask) ? ask : undefined,
    price,
    volume: 0,
  };
}

async function fetchFirstBinanceJson(path: string) {
  const errors: string[] = [];

  for (const baseUrl of BINANCE_PUBLIC_DATA_BASE_URLS) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        next: { revalidate: 0 },
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.msg ?? `HTTP ${response.status}`);
      }

      return payload;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(errors.at(-1) ?? "CryptoOHLCFeed indisponible.");
}

function clampLimit(value: number) {
  if (!Number.isFinite(value)) {
    return 600;
  }

  return Math.min(1000, Math.max(50, Math.floor(value)));
}
