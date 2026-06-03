import type { Candle, MarketTick, Timeframe } from "@/types";
import { fetchEodhdHistory, fetchEodhdTick, getEodhdRestSymbol, getEodhdSourceLabel } from "@/lib/market/eodhd-market";
import { fetchYahooGoldHistory, fetchYahooGoldTick, getYahooGoldSymbol, getYahooSourceLabel } from "@/lib/market/yahoo-market";

export interface MarketDataResult<T> {
  data: T;
  provider: string;
  symbol: string;
  warning: string | null;
}

export async function fetchMarketHistory(timeframe: Timeframe, limit: number): Promise<MarketDataResult<Candle[]>> {
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
