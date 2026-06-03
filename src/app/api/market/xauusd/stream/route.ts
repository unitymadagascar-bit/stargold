import { NextResponse } from "next/server";
import { getEodhdSourceLabel, getEodhdWebSocketUrl, getEodhdWsSymbol, normalizeEodhdStreamTick } from "@/lib/market/eodhd-market";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (typeof WebSocket === "undefined") {
    return NextResponse.json({ error: "WebSocket serveur indisponible, utilise le polling HTTP." }, { status: 503 });
  }

  try {
    const stream = createEodhdSseStream();

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Flux XAUUSD indisponible." },
      { status: 503 },
    );
  }
}

function createEodhdSseStream() {
  const encoder = new TextEncoder();
  let socket: WebSocket | null = null;
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  return new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const close = () => {
        if (keepAlive) {
          clearInterval(keepAlive);
          keepAlive = null;
        }

        try {
          controller.close();
        } catch {
          // The browser may already have closed the EventSource.
        }
      };

      socket = new WebSocket(getEodhdWebSocketUrl());
      keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, 15000);

      socket.addEventListener("open", () => {
        socket?.send(JSON.stringify({ action: "subscribe", symbols: getEodhdWsSymbol() }));
        send("status", {
          status: "live",
          source: getEodhdSourceLabel(),
          symbol: getEodhdWsSymbol(),
          updatedAt: new Date().toISOString(),
        });
      });

      socket.addEventListener("message", (event) => {
        const tick = normalizeEodhdStreamTick(event.data);

        if (!tick) {
          return;
        }

        send("tick", {
          source: getEodhdSourceLabel(),
          symbol: getEodhdWsSymbol(),
          updatedAt: new Date().toISOString(),
          tick,
        });
      });

      socket.addEventListener("error", () => {
        send("error", {
          source: getEodhdSourceLabel(),
          symbol: getEodhdWsSymbol(),
          message: "Erreur sur le WebSocket EODHD.",
          updatedAt: new Date().toISOString(),
        });
      });

      socket.addEventListener("close", close);
    },
    cancel() {
      if (keepAlive) {
        clearInterval(keepAlive);
      }

      socket?.close();
    },
  });
}
