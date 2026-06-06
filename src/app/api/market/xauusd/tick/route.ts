import { NextResponse } from "next/server";
import { bridgeCorsHeaders, bridgeOptionsResponse } from "@/lib/http/cors";
import { fetchMarketTick } from "@/lib/market/market-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS() {
  return bridgeOptionsResponse();
}

export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("symbol") ?? "XAUUSD";

  try {
    const result = await fetchMarketTick(symbol);

    return NextResponse.json(
      {
        source: result.provider,
        symbol: result.symbol,
        updatedAt: new Date().toISOString(),
        warning: result.warning,
        tick: result.data,
      },
      { headers: bridgeCorsHeaders },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : `Tick ${symbol} indisponible.`,
        source: "unavailable",
        symbol,
        updatedAt: new Date().toISOString(),
        tick: null,
      },
      { status: 503, headers: bridgeCorsHeaders },
    );
  }
}
