import type { Candle, MarketTick, Timeframe } from "@/types";
import { fetchEodhdHistory, fetchEodhdTick, getEodhdRestSymbol, getEodhdSourceLabel } from "@/lib/market/eodhd-market";
import { getMt5History, getMt5Tick } from "@/lib/market/mt5-store";
import { fetchYahooGoldHistory, fetchYahooGoldTick, getYahooGoldSymbol, getYahooSourceLabel } from "@/lib/market/yahoo-market";

export interface MarketDataResult<T> {
  data: T;
  provider: string;
  symbol: string;
  warning: string | null;
}

export async function fetchMarketHistory(timeframe: Timeframe, limit: number): Promise<MarketDataResult<Candle[]>> {
  const mt5 = await getMt5History(timeframe, limit);

  if (mt5) {
    return {
      data: mt5.data,
      provider: mt5.provider,
      symbol: mt5.symbol,
      warning: null,
    };
  }

  if (!isExternalFallbackEnabled()) {
    throw new Error("MT5 non connecte. Lance le bridge Star Gold By TSR dans MT5 pour synchroniser les bougies avec ton broker.");
  }

  try {
    const data = await fetchEodhdHistory(timeframe, limit);

    if (data.length) {
      return {
        data,
        provider: getEodhdSourceLabel(),
        symbol: getEodhdRestSymbol(),
        warning: null,
      };
    }

    throw new Error("EODHD ne renvoie aucune bougie.");
  } catch (error) {
    const data = await fetchYahooGoldHistory(timeframe, limit);

    return {
      data,
      provider: getYahooSourceLabel(),
      symbol: getYahooGoldSymbol(),
      warning: `Fallback Yahoo Finance utilise car EODHD intraday/live est indisponible: ${formatError(error)}`,
    };
  }
}

export async function fetchMarketTick(): Promise<MarketDataResult<MarketTick>> {
  const mt5 = await getMt5Tick();

  if (mt5) {
    return {
      data: mt5.data,
      provider: mt5.provider,
      symbol: mt5.symbol,
      warning: null,
    };
  }

  if (!isExternalFallbackEnabled()) {
    throw new Error("MT5 non connecte. Lance le bridge Star Gold By TSR dans MT5 pour synchroniser le prix avec ton broker.");
  }

  try {
    const data = await fetchEodhdTick();

    return {
      data,
      provider: getEodhdSourceLabel(),
      symbol: getEodhdRestSymbol(),
      warning: null,
    };
  } catch (error) {
    const data = await fetchYahooGoldTick();

    return {
      data,
      provider: getYahooSourceLabel(),
      symbol: getYahooGoldSymbol(),
      warning: `Fallback Yahoo Finance utilise car EODHD real-time est indisponible: ${formatError(error)}`,
    };
  }
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isExternalFallbackEnabled() {
  return process.env.ALLOW_EXTERNAL_GOLD_FALLBACK !== "false" && (process.env.ALLOW_EXTERNAL_GOLD_FALLBACK === "true" || process.env.VERCEL === "1");
}
