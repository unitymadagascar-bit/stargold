import { bridgeCorsHeaders, bridgeOptionsResponse } from "@/lib/http/cors";
import { getMt5Tick } from "@/lib/market/mt5-store";
import { getLatestMt5LiveEvent, subscribeMt5LiveEvents } from "@/lib/market/mt5-live-bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS() {
  return bridgeOptionsResponse();
}

export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("symbol") ?? "XAUUSD";
  const encoder = new TextEncoder();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;
  let closed = false;
  const normalizedSymbol = normalizeBridgeSymbol(symbol);

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (!closed) {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        }
      };

      send("status", {
        status: "streaming",
        source: "mt5-live-bus",
        symbol,
        updatedAt: new Date().toISOString(),
      });

      const latestEvent = getLatestMt5LiveEvent(normalizedSymbol);
      if (latestEvent) {
        send("tick", latestEvent);
      } else {
        getMt5Tick(normalizedSymbol)
          .then((result) => {
            if (result) {
              send("tick", {
                brokerSymbol: result.brokerSymbol ?? result.data.symbol ?? result.symbol,
                candleCounts: null,
                currentCandles: {},
                lastClosedCandles: {},
                source: result.provider,
                symbol: result.symbol,
                tick: result.data,
                updatedAt: result.updatedAt ?? new Date().toISOString(),
              });
            }
          })
          .catch(() => {
            send("market-error", {
              brokerSymbol: symbol,
              message: `Flux live indisponible pour ${symbol}.`,
              source: "unavailable",
              symbol,
              updatedAt: new Date().toISOString(),
            });
          });
      }

      unsubscribe = subscribeMt5LiveEvents((event) => {
        if (event.symbol === normalizedSymbol) {
          send("tick", event);
        }
      });

      heartbeatTimer = setInterval(() => {
        send("heartbeat", {
          source: "mt5-live-bus",
          symbol,
          updatedAt: new Date().toISOString(),
        });
      }, 15000);
    },
    cancel() {
      closed = true;
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      ...bridgeCorsHeaders,
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}

function normalizeBridgeSymbol(symbol: string) {
  const normalized = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
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
