import { NextResponse } from "next/server";
import type { Timeframe } from "@/types";
import { fetchEodhdHistory, getEodhdRestSymbol, getEodhdSourceLabel } from "@/lib/market/eodhd-market";
import { timeframes } from "@/lib/market/timeframes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const timeframe = url.searchParams.get("timeframe") ?? "M5";
  const limit = clampLimit(Number(url.searchParams.get("limit") ?? 600));

  if (!timeframes.includes(timeframe as Timeframe)) {
    return NextResponse.json({ error: "Timeframe invalide." }, { status: 400 });
  }

  try {
    const candles = await fetchEodhdHistory(timeframe as Timeframe, limit);

    return NextResponse.json({
      source: getEodhdSourceLabel(),
      symbol: getEodhdRestSymbol(),
      timeframe,
      updatedAt: new Date().toISOString(),
      candles,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Historique XAUUSD indisponible.",
        source: getEodhdSourceLabel(),
        symbol: getEodhdRestSymbol(),
        timeframe,
        updatedAt: new Date().toISOString(),
        candles: [],
      },
      { status: 503 },
    );
  }
}

function clampLimit(value: number) {
  if (!Number.isFinite(value)) {
    return 600;
  }

  return Math.min(800, Math.max(50, Math.floor(value)));
}
