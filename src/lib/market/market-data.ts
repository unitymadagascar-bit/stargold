import type { Candle, MarketTick, Timeframe } from "@/types";
import { fetchEodhdHistory, fetchEodhdTick, getEodhdRestSymbol, getEodhdSourceLabel } from "@/lib/market/eodhd-market";
import { getMt5History, getMt5Tick } from "@/lib/market/mt5-store";
import { fetchYahooGoldHistory, fetchYahooGoldTick, getYahooGoldSymbol, getYahooSourceLabel } from "@/lib/market/yahoo-market";
import { normalizeSymbol } from "@/lib/symbols/profiles";

export interface MarketDataResult<T> {
  data: T;
  provider: string;
  symbol: string;
  warning: string | null;
}

export async function fetchMarketHistory(timeframe: Timeframe, limit: number, symbol = "XAUUSD"): Promise<MarketDataResult<Candle[]>> {
  const normalizedSymbol = normalizeSymbol(symbol);
  const mt5 = await getMt5History(timeframe, limit, normalizedSymbol);

  if (mt5) {
    return {
      data: mt5.data,
      provider: mt5.provider,
      symbol: mt5.symbol,
      warning: null,
    };
  }

  if (!isExternalFallbackEnabled()) {
    throw new Error(`MT5 non connecte pour ${normalizedSymbol}. Attache le bridge Star Gold By TSR sur un graphique ${normalizedSymbol} dans MT5.`);
  }

  if (normalizedSymbol !== "XAUUSD") {
    throw new Error(`Aucun flux ${normalizedSymbol}. Le fallback externe est reserve a XAUUSD; ouvre ${normalizedSymbol} dans MT5 avec le bridge.`);
  }

  try {
    const data = await fetchEodhdHistory(timeframe, limit);

    if (data.length) {
      return {
        data,
        provider: `Fallback, not live MT5 - ${getEodhdSourceLabel()}`,
        symbol: getEodhdRestSymbol(),
        warning: "Fallback, not live MT5. En attente du prochain tick MT5.",
      };
    }

    throw new Error("EODHD ne renvoie aucune bougie.");
  } catch (error) {
    const data = await fetchYahooGoldHistory(timeframe, limit);

    return {
      data,
      provider: `Fallback, not live MT5 - ${getYahooSourceLabel()}`,
      symbol: getYahooGoldSymbol(),
      warning: `Fallback, not live MT5. Yahoo Finance utilise car EODHD intraday/live est indisponible: ${formatError(error)}`,
    };
  }
}

export async function fetchMarketTick(symbol = "XAUUSD"): Promise<MarketDataResult<MarketTick>> {
  const normalizedSymbol = normalizeSymbol(symbol);
  const mt5 = await getMt5Tick(normalizedSymbol);

  if (mt5) {
    return {
      data: mt5.data,
      provider: mt5.provider,
      symbol: mt5.symbol,
      warning: null,
    };
  }

  if (!isExternalFallbackEnabled()) {
    throw new Error(`MT5 non connecte pour ${normalizedSymbol}. Attache le bridge Star Gold By TSR sur un graphique ${normalizedSymbol} dans MT5.`);
  }

  if (normalizedSymbol !== "XAUUSD") {
    throw new Error(`Aucun tick ${normalizedSymbol}. Le fallback externe est reserve a XAUUSD; ouvre ${normalizedSymbol} dans MT5 avec le bridge.`);
  }

  try {
    const data = await fetchEodhdTick();

    return {
      data,
      provider: `Fallback, not live MT5 - ${getEodhdSourceLabel()}`,
      symbol: getEodhdRestSymbol(),
      warning: "Fallback, not live MT5. En attente du prochain tick MT5.",
    };
  } catch (error) {
    const data = await fetchYahooGoldTick();

    return {
      data,
      provider: `Fallback, not live MT5 - ${getYahooSourceLabel()}`,
      symbol: getYahooGoldSymbol(),
      warning: `Fallback, not live MT5. Yahoo Finance utilise car EODHD real-time est indisponible: ${formatError(error)}`,
    };
  }
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isExternalFallbackEnabled() {
  return process.env.ALLOW_EXTERNAL_GOLD_FALLBACK !== "false" && (process.env.ALLOW_EXTERNAL_GOLD_FALLBACK === "true" || process.env.VERCEL === "1");
}
