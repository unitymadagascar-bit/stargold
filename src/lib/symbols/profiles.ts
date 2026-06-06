import type { AssetCategory, SymbolCode, SymbolProfile } from "@/types";

export const symbolProfiles: SymbolProfile[] = [
  {
    symbol: "XAUUSD",
    label: "Gold vs US Dollar",
    category: "Metals",
    volatility: "high",
    sessions: ["London", "New York", "Comex"],
    importantNews: ["USD red news", "CPI", "NFP", "FOMC", "US10Y", "DXY"],
    strategy: "Gold ORB + FVG scalp engine with liquidity, rejection and USD macro safety.",
    quoteCurrency: "USD",
    spreadWarning: 0.45,
  },
  {
    symbol: "XAGUSD",
    label: "Silver vs US Dollar",
    category: "Commodities",
    volatility: "high",
    sessions: ["London", "New York"],
    importantNews: ["USD red news", "metals sentiment", "DXY"],
    strategy: "Commodity continuation/retest engine. Use FVG and liquidity as confirmation, not standalone entries.",
    quoteCurrency: "USD",
  },
  {
    symbol: "BTCUSD",
    label: "Bitcoin vs US Dollar",
    category: "Crypto",
    volatility: "extreme",
    sessions: ["24/7", "London", "New York"],
    importantNews: ["USD red news", "crypto regulation", "risk sentiment"],
    strategy: "Crypto momentum engine with volatility guard, liquidity sweeps and wider confirmation thresholds.",
    quoteCurrency: "USD",
  },
  {
    symbol: "ETHUSD",
    label: "Ethereum vs US Dollar",
    category: "Crypto",
    volatility: "extreme",
    sessions: ["24/7", "London", "New York"],
    importantNews: ["USD red news", "crypto regulation", "risk sentiment"],
    strategy: "Crypto momentum engine with volatility guard, liquidity sweeps and wider confirmation thresholds.",
    quoteCurrency: "USD",
  },
  ...["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD"].map(
    (symbol): SymbolProfile => ({
      symbol,
      label: `${symbol.slice(0, 3)} vs ${symbol.slice(3)}`,
      category: "Forex",
      volatility: symbol === "GBPUSD" || symbol === "USDJPY" ? "medium" : "low",
      sessions: ["London", "New York"],
      importantNews: ["central bank news", `${symbol.slice(0, 3)} news`, `${symbol.slice(3)} news`, "red USD news"],
      strategy: "Forex structure/retest engine. Favor session trend, support/resistance, liquidity sweep and controlled spread.",
      quoteCurrency: symbol.slice(3),
    }),
  ),
  ...[
    ["US30", "Dow Jones 30"],
    ["NAS100", "Nasdaq 100"],
    ["SPX500", "S&P 500"],
  ].map(
    ([symbol, label]): SymbolProfile => ({
      symbol,
      label,
      category: "Indices",
      volatility: "high",
      sessions: ["New York cash", "US futures"],
      importantNews: ["US red news", "FOMC", "earnings risk", "risk sentiment"],
      strategy: "Index breakout/retest engine. Avoid chasing extended moves; require structure and volatility control.",
      quoteCurrency: "USD",
    }),
  ),
  ...[
    ["USOIL", "US Crude Oil"],
    ["UKOIL", "Brent Crude Oil"],
  ].map(
    ([symbol, label]): SymbolProfile => ({
      symbol,
      label,
      category: "Energies",
      volatility: "high",
      sessions: ["London", "New York", "NYMEX"],
      importantNews: ["oil inventories", "OPEC", "geopolitics", "USD red news"],
      strategy: "Energy retest engine. Confirm breakouts with momentum and beware inventory/news spikes.",
      quoteCurrency: "USD",
    }),
  ),
  ...["AMZN", "TSLA", "AAPL", "MSFT", "NVDA", "META", "GOOGL"].map(
    (symbol): SymbolProfile => ({
      symbol,
      label: `${symbol} CFD`,
      category: "Stocks",
      volatility: symbol === "TSLA" || symbol === "NVDA" ? "high" : "medium",
      sessions: ["US cash", "US premarket"],
      importantNews: ["earnings", "company news", "US red news", "market risk sentiment"],
      strategy: "Stock CFD trend/retest engine. Prefer US cash-session liquidity and avoid earnings shock periods.",
      quoteCurrency: "USD",
    }),
  ),
];

export function getSymbolProfile(symbol: SymbolCode): SymbolProfile {
  const normalized = normalizeSymbol(symbol);
  return symbolProfiles.find((profile) => profile.symbol === normalized) ?? inferSymbolProfile(normalized);
}

export function normalizeSymbol(symbol: SymbolCode) {
  return symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function getSymbolsByCategory() {
  return symbolProfiles.reduce(
    (groups, profile) => ({
      ...groups,
      [profile.category]: [...(groups[profile.category] ?? []), profile],
    }),
    {} as Partial<Record<AssetCategory, SymbolProfile[]>>,
  );
}

function inferSymbolProfile(symbol: string): SymbolProfile {
  const category = inferCategory(symbol);

  return {
    symbol,
    label: symbol,
    category,
    volatility: category === "Crypto" ? "extreme" : category === "Indices" || category === "Energies" ? "high" : "medium",
    sessions: category === "Crypto" ? ["24/7"] : category === "Stocks" || category === "Indices" ? ["New York"] : ["London", "New York"],
    importantNews: category === "Stocks" ? ["company news", "earnings", "USD red news"] : ["USD red news", "macro news"],
    strategy: `${category} adaptive engine. Uses trend, structure, FVG, liquidity, volatility and news safety.`,
    quoteCurrency: symbol.endsWith("USD") ? "USD" : undefined,
  };
}

function inferCategory(symbol: string): AssetCategory {
  if (symbol.includes("BTC") || symbol.includes("ETH") || symbol.includes("CRYPTO")) {
    return "Crypto";
  }

  if (symbol === "XAUUSD") {
    return "Metals";
  }

  if (symbol === "XAGUSD" || symbol.includes("OIL")) {
    return "Commodities";
  }

  if (["US30", "NAS100", "SPX500", "GER40", "UK100", "JP225"].includes(symbol)) {
    return "Indices";
  }

  if (/^[A-Z]{6}$/.test(symbol) && ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD"].some((currency) => symbol.includes(currency))) {
    return "Forex";
  }

  return "Stocks";
}
