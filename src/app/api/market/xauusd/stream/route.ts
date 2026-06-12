import { bridgeCorsHeaders, bridgeOptionsResponse } from "@/lib/http/cors";
import { fetchMarketTick } from "@/lib/market/market-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS() {
  return bridgeOptionsResponse();
}

export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("symbol") ?? "XAUUSD";
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (!closed) {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        }
      };

      const pushTick = async () => {
        try {
          const result = await fetchMarketTick(symbol);
          send("tick", {
            source: result.provider,
            symbol: result.symbol,
            brokerSymbol: result.brokerSymbol ?? result.data.symbol ?? result.symbol,
            warning: result.warning,
            updatedAt: new Date().toISOString(),
            tick: result.data,
          });
        } catch (error) {
          send("market-error", {
            source: "unavailable",
            symbol,
            brokerSymbol: symbol,
            message: error instanceof Error ? error.message : `Tick ${symbol} indisponible.`,
            updatedAt: new Date().toISOString(),
          });
        }
      };

      send("status", {
        status: "connecting",
        source: "market-data",
        symbol,
        updatedAt: new Date().toISOString(),
      });

      pushTick();
      timer = setInterval(pushTick, 750);
    },
    cancel() {
      closed = true;
      if (timer) {
        clearInterval(timer);
      }
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
