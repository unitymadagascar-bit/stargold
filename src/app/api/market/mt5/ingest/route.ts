import { NextResponse } from "next/server";
import { bridgeCorsHeaders, bridgeOptionsResponse } from "@/lib/http/cors";
import { getMt5Status, ingestMt5Payload } from "@/lib/market/mt5-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS() {
  return bridgeOptionsResponse();
}

export async function GET() {
  return NextResponse.json(getMt5Status(), { headers: bridgeCorsHeaders });
}

export async function POST(request: Request) {
  const token = process.env.MT5_BRIDGE_TOKEN;

  if (token) {
    const url = new URL(request.url);
    const providedToken = request.headers.get("x-mt5-token") ?? url.searchParams.get("token");

    if (providedToken !== token) {
      return NextResponse.json({ error: "Token MT5 invalide." }, { status: 401, headers: bridgeCorsHeaders });
    }
  }

  try {
    const result = ingestMt5Payload(await request.json());

    return NextResponse.json(
      {
        ok: true,
        source: result.provider,
        symbol: result.symbol,
        updatedAt: result.updatedAt,
        candleCounts: result.data,
      },
      { headers: bridgeCorsHeaders },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Payload MT5 invalide.",
      },
      { status: 400, headers: bridgeCorsHeaders },
    );
  }
}
