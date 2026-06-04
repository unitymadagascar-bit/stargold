import { NextResponse } from "next/server";
import { bridgeCorsHeaders, bridgeOptionsResponse } from "@/lib/http/cors";
import { getMt5Status, ingestMt5Payload } from "@/lib/market/mt5-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS() {
  return bridgeOptionsResponse();
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (url.searchParams.has("tick") || url.searchParams.has("bid") || url.searchParams.has("price")) {
    const tokenResponse = validateBridgeToken(request, url);
    if (tokenResponse) {
      return tokenResponse;
    }

    try {
      const result = await ingestMt5Payload({
        source: url.searchParams.get("source") ?? "MT5",
        symbol: url.searchParams.get("symbol") ?? "XAUUSD",
        tick: {
          symbol: url.searchParams.get("symbol") ?? "XAUUSD",
          time: Number(url.searchParams.get("time") ?? Date.now()),
          bid: numberOrUndefined(url.searchParams.get("bid")),
          ask: numberOrUndefined(url.searchParams.get("ask")),
          price: numberOrUndefined(url.searchParams.get("price") ?? url.searchParams.get("bid")),
          volume: numberOrUndefined(url.searchParams.get("volume")) ?? 0,
        },
      });

      logBridgeDebug("MT5 bridge GET tick accepted", {
        source: result.provider,
        symbol: result.symbol,
        updatedAt: result.updatedAt,
      });

      return NextResponse.json(
        {
          ok: true,
          mode: "get-tick-fallback",
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
          error: error instanceof Error ? error.message : "Tick MT5 invalide.",
        },
        { status: 400, headers: bridgeCorsHeaders },
      );
    }
  }

  return NextResponse.json(await getMt5Status(), { headers: bridgeCorsHeaders });
}

export async function POST(request: Request) {
  const tokenResponse = validateBridgeToken(request, new URL(request.url));
  if (tokenResponse) {
    return tokenResponse;
  }

  try {
    const result = await ingestMt5Payload(await request.json());
    logBridgeDebug("MT5 bridge POST accepted", {
      source: result.provider,
      symbol: result.symbol,
      updatedAt: result.updatedAt,
      candleCounts: result.data,
    });

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

function validateBridgeToken(request: Request, url: URL) {
  const token = process.env.MT5_BRIDGE_TOKEN;

  if (!token) {
    return null;
  }

  const providedToken = request.headers.get("x-mt5-token") ?? url.searchParams.get("token");

  if (providedToken !== token) {
    return NextResponse.json({ error: "Token MT5 invalide." }, { status: 401, headers: bridgeCorsHeaders });
  }

  return null;
}

function numberOrUndefined(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function logBridgeDebug(message: string, details: Record<string, unknown>) {
  if (process.env.MT5_BRIDGE_DEBUG === "true") {
    console.info(message, details);
  }
}
