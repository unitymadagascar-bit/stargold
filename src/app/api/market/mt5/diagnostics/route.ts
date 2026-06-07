import { NextResponse } from "next/server";
import { fetchMarketTick } from "@/lib/market/market-data";
import { getMt5Status } from "@/lib/market/mt5-store";
import { normalizeSymbol } from "@/lib/symbols/profiles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STALE_TICK_MS = 10_000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = normalizeDiagnosticSymbol(url.searchParams.get("symbol") ?? "XAUUSD");
  const checkedAt = new Date().toISOString();

  try {
    const mt5 = await getMt5Status(symbol);
    const lastTickAgeMs = mt5.updatedAt ? Date.now() - Date.parse(mt5.updatedAt) : null;
    const mt5Source = isMt5Source(mt5.source);
    let activeSource = mt5.connected && mt5Source ? "MT5" : "fallback";
    let graphPrice: number | null = null;
    let graphSource = "unavailable";
    let graphError: string | null = null;

    try {
      const market = await fetchMarketTick(symbol);
      graphPrice = market.data.price;
      graphSource = market.provider;
      activeSource = isMt5Source(market.provider) ? "MT5" : market.provider.includes("Fallback") ? "fallback" : "API externe";
    } catch (error) {
      graphError = error instanceof Error ? error.message : "API marche inaccessible.";
    }

    const priceDelta = graphPrice !== null && mt5.lastTick?.price ? Math.abs(graphPrice - mt5.lastTick.price) : null;
    const priceSynced = priceDelta === null || priceDelta <= getPriceTolerance(symbol);
    const diagnostics = buildDiagnostics({
      graphError,
      graphSource,
      lastTickAgeMs,
      mt5Connected: mt5.connected && mt5Source,
      mt5Source,
      priceSynced,
      requestedSymbol: symbol,
      statusSymbol: mt5.symbol,
      updatedAt: mt5.updatedAt,
    });

    return NextResponse.json({
      ok: true,
      checkedAt,
      connection: {
        activeSource,
        brokerSymbol: mt5.brokerSymbol ?? mt5.symbol,
        candleCounts: mt5.candleCounts,
        connected: mt5.connected && mt5Source,
        graphPrice,
        graphSource,
        lastPrice: mt5.lastTick?.price ?? null,
        lastTickAgeMs,
        lastTimestamp: mt5.updatedAt,
        persistence: mt5.persistence,
        requestedSymbol: symbol,
        source: mt5.source,
        symbol: mt5.symbol,
      },
      diagnostics,
      error: diagnostics.find((item) => item.status === "error")?.message ?? null,
      setupUrl: `${url.origin}/api/market/mt5/ingest`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        checkedAt,
        connection: null,
        diagnostics: [
          {
            code: "api-inaccessible",
            label: "API inaccessible",
            message: error instanceof Error ? error.message : "La route diagnostic MT5 est inaccessible.",
            status: "error",
          },
        ],
        error: error instanceof Error ? error.message : "Diagnostic MT5 impossible.",
        setupUrl: `${url.origin}/api/market/mt5/ingest`,
      },
      { status: 500 },
    );
  }
}

function buildDiagnostics({
  graphError,
  graphSource,
  lastTickAgeMs,
  mt5Connected,
  mt5Source,
  priceSynced,
  requestedSymbol,
  statusSymbol,
  updatedAt,
}: {
  graphError: string | null;
  graphSource: string;
  lastTickAgeMs: number | null;
  mt5Connected: boolean;
  mt5Source: boolean;
  priceSynced: boolean;
  requestedSymbol: string;
  statusSymbol: string;
  updatedAt: string | null;
}) {
  const noTick = !updatedAt;
  const staleTick = lastTickAgeMs !== null && lastTickAgeMs > STALE_TICK_MS;
  const symbolMismatch = normalizeSymbol(statusSymbol) !== requestedSymbol;

  return [
    {
      code: "mt5-not-running",
      label: "MT5 non lance",
      message: noTick ? "Aucun tick MT5 n'a encore ete recu. Ouvre MT5 sur ce PC et connecte le compte broker." : "MT5 a deja envoye des donnees a l'application.",
      status: noTick ? "error" : "ok",
    },
    {
      code: "ea-inactive",
      label: "EA non actif",
      message: staleTick ? "Le dernier tick MT5 date de plus de 10 secondes. Active Algo Trading et verifie que TradeTSRBridge est attache au graphique." : "Le flux MT5 est recent ou en cours de reception.",
      status: staleTick ? "error" : "ok",
    },
    {
      code: "wrong-symbol",
      label: "Mauvais symbole",
      message: symbolMismatch ? `L'application demande ${requestedSymbol}, mais le dernier statut MT5 indique ${statusSymbol}. Ouvre le bon symbole dans MT5 ou verifie le suffixe broker.` : "Le symbole MT5 correspond au symbole demande.",
      status: symbolMismatch ? "warning" : "ok",
    },
    {
      code: "no-tick",
      label: "Aucun tick recu",
      message: noTick || staleTick ? "Aucun tick MT5 exploitable en temps reel. Le dashboard peut utiliser une source externe en attendant." : "Dernier tick MT5 recu il y a moins de 10 secondes.",
      status: noTick || staleTick ? "error" : "ok",
    },
    {
      code: "api-inaccessible",
      label: "API inaccessible",
      message: graphError ? `API marche indisponible: ${graphError}` : "API application accessible.",
      status: graphError ? "error" : "ok",
    },
    {
      code: "price-not-synced",
      label: "Prix non synchronise avec le graphique",
      message: mt5Connected && mt5Source && priceSynced ? "Le graphique et l'analyse utilisent le flux MT5." : `Source graphique/analyse actuelle: ${graphSource}. Le scalping doit attendre une source MT5 synchronisee.`,
      status: mt5Connected && mt5Source && priceSynced ? "ok" : "warning",
    },
  ];
}

function isMt5Source(source: string | null | undefined) {
  if (!source) {
    return false;
  }

  const normalized = source.toLowerCase();
  return normalized.includes("mt5") || normalized.includes("exness") || normalized.includes("bridge");
}

function getPriceTolerance(symbol: string) {
  if (symbol.startsWith("BTC")) {
    return 20;
  }

  if (symbol.startsWith("ETH")) {
    return 5;
  }

  if (symbol.startsWith("XAU")) {
    return 1;
  }

  return 0.0005;
}

function normalizeDiagnosticSymbol(symbol: string) {
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
  return knownBase.find((base) => normalized === base || normalized.startsWith(base)) ?? normalized;
}
