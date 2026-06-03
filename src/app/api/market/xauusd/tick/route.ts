import { NextResponse } from "next/server";
import { fetchEodhdTick, getEodhdRestSymbol, getEodhdSourceLabel } from "@/lib/market/eodhd-market";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const tick = await fetchEodhdTick();

    return NextResponse.json({
      source: getEodhdSourceLabel(),
      symbol: getEodhdRestSymbol(),
      updatedAt: new Date().toISOString(),
      tick,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Tick XAUUSD indisponible.",
        source: getEodhdSourceLabel(),
        symbol: getEodhdRestSymbol(),
        updatedAt: new Date().toISOString(),
        tick: null,
      },
      { status: 503 },
    );
  }
}
