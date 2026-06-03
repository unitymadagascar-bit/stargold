import { NextResponse } from "next/server";
import type { Timeframe } from "@/types";
import { bridgeCorsHeaders, bridgeOptionsResponse } from "@/lib/http/cors";
import { fetchMarketHistory } from "@/lib/market/market-data";
import { timeframes } from "@/lib/market/timeframes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS() {
  return bridgeOptionsResponse();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const timeframe = url.searchParams.get("timeframe") ?? "M5";
  const limit = clampLimit(Number(url.searchParams.get("limit") ?? 600));

  if (!timeframes.includes(timeframe as Timeframe)) {
    return NextResponse.json({ error: "Timeframe invalide." }, { status: 400, headers: bridgeCorsHeaders });
  }

  try {
    const result = await fetchMarketHistory(timeframe as Timeframe, limit);

    return NextResponse.json(
      {
        source: result.provider,
        symbol: result.symbol,
        timeframe,
        updatedAt: new Date().toISOString(),
        warning: result.warning,
        candles: result.data,
      },
      { headers: bridgeCorsHeaders },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Historique XAUUSD indisponible.",
        source: "unavailable",
        symbol: "XAUUSD",
        timeframe,
        updatedAt: new Date().toISOString(),
        candles: [],
      },
      { status: 503, headers: bridgeCorsHeaders },
    );
  }
}

function clampLimit(value: number) {
  if (!Number.isFinite(value)) {
    return 600;
  }

  return Math.min(800, Math.max(50, Math.floor(value)));
}
