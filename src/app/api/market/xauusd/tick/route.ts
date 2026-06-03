import { NextResponse } from "next/server";
import { fetchMarketTick } from "@/lib/market/market-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await fetchMarketTick();

    return NextResponse.json({
      source: result.provider,
      symbol: result.symbol,
      updatedAt: new Date().toISOString(),
      warning: result.warning,
      tick: result.data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Tick XAUUSD indisponible.",
        source: "unavailable",
        symbol: "XAUUSD",
        updatedAt: new Date().toISOString(),
        tick: null,
      },
      { status: 503 },
    );
  }
}
