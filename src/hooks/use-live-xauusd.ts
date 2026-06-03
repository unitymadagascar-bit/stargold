"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Candle, LiveMarketState, MarketTick, Timeframe } from "@/types";
import { applyTickToCandles, normalizeHistoryCandles, normalizeProviderTick } from "@/lib/market/candle-engine";
import { timeframes } from "@/lib/market/timeframes";

function createEmptyCandleMap(): Record<Timeframe, Candle[]> {
  return timeframes.reduce(
    (accumulator, timeframe) => ({
      ...accumulator,
      [timeframe]: [],
    }),
    {} as Record<Timeframe, Candle[]>,
  );
}

const streamUrl = process.env.NEXT_PUBLIC_XAUUSD_TICK_STREAM_URL ?? "";
const historyUrl = process.env.NEXT_PUBLIC_XAUUSD_HISTORY_URL ?? "";
const serverOffsetMinutes = Number(process.env.NEXT_PUBLIC_MARKET_SERVER_UTC_OFFSET_MINUTES ?? 0);

export function useLiveXauusd(): LiveMarketState {
  const [state, setState] = useState<LiveMarketState>({
    status: streamUrl ? "connecting" : "missing-config",
    message: streamUrl
      ? "Connexion au flux XAUUSD en cours."
      : "Flux live non configure. Ajoute NEXT_PUBLIC_XAUUSD_TICK_STREAM_URL pour connecter MT5 ou ton provider.",
    lastTick: null,
    serverOffsetMinutes: Number.isFinite(serverOffsetMinutes) ? serverOffsetMinutes : 0,
    latencyMs: null,
    candleMap: createEmptyCandleMap(),
  });
  const retryRef = useRef(0);

  useEffect(() => {
    let disposed = false;

    async function loadHistory() {
      if (!historyUrl) {
        return;
      }

      const results = await Promise.allSettled(
        timeframes.map(async (timeframe) => {
          const url = new URL(historyUrl);
          url.searchParams.set("symbol", "XAUUSD");
          url.searchParams.set("timeframe", timeframe);
          url.searchParams.set("limit", "600");
          const response = await fetch(url.toString(), { cache: "no-store" });

          if (!response.ok) {
            throw new Error(`History ${timeframe}: ${response.status}`);
          }

          return [timeframe, normalizeHistoryCandles(await response.json())] as const;
        }),
      );

      if (disposed) {
        return;
      }

      setState((current) => {
        const candleMap = { ...current.candleMap };
        for (const result of results) {
          if (result.status === "fulfilled") {
            candleMap[result.value[0]] = result.value[1];
          }
        }

        return { ...current, candleMap };
      });
    }

    loadHistory().catch((error: unknown) => {
      if (!disposed) {
        setState((current) => ({
          ...current,
          status: streamUrl ? current.status : "error",
          message: error instanceof Error ? error.message : "Impossible de charger l'historique.",
        }));
      }
    });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!streamUrl) {
      return;
    }

    let disposed = false;
    let close: (() => void) | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function processTick(tick: MarketTick) {
      const latencyMs = Math.max(0, Date.now() - tick.time * 1000);

      setState((current) => {
        const candleMap = { ...current.candleMap };
        for (const timeframe of timeframes) {
          candleMap[timeframe] = applyTickToCandles({
            candles: current.candleMap[timeframe],
            tick,
            timeframe,
            serverOffsetMinutes: current.serverOffsetMinutes,
          });
        }

        return {
          ...current,
          status: "live",
          message: "Flux XAUUSD live connecte.",
          lastTick: tick,
          latencyMs,
          candleMap,
        };
      });
    }

    function processMessage(data: unknown) {
      if (Array.isArray(data)) {
        for (const item of data) {
          const tick = normalizeProviderTick(item);
          if (tick) {
            processTick(tick);
          }
        }
        return;
      }

      const tick = normalizeProviderTick(data);
      if (tick) {
        processTick(tick);
      }
    }

    function scheduleReconnect() {
      if (disposed) {
        return;
      }

      retryRef.current += 1;
      const delay = Math.min(2000 * retryRef.current, 12000);
      setState((current) => ({
        ...current,
        status: "reconnecting",
        message: `Flux coupe. Reconnexion dans ${Math.round(delay / 1000)}s.`,
      }));
      retryTimer = setTimeout(connect, delay);
    }

    function connect() {
      if (disposed) {
        return;
      }

      setState((current) => ({ ...current, status: retryRef.current ? "reconnecting" : "connecting", message: "Connexion au flux XAUUSD." }));

      if (streamUrl.startsWith("ws")) {
        const socket = new WebSocket(streamUrl);
        close = () => socket.close();

        socket.addEventListener("open", () => {
          retryRef.current = 0;
          setState((current) => ({ ...current, status: "live", message: "Flux XAUUSD live connecte." }));
        });
        socket.addEventListener("message", (event) => {
          try {
            processMessage(JSON.parse(event.data));
          } catch {
            processMessage(event.data);
          }
        });
        socket.addEventListener("close", scheduleReconnect);
        socket.addEventListener("error", () => {
          setState((current) => ({ ...current, status: "error", message: "Erreur sur le flux WebSocket XAUUSD." }));
        });
        return;
      }

      const eventSource = new EventSource(streamUrl);
      close = () => eventSource.close();

      eventSource.addEventListener("open", () => {
        retryRef.current = 0;
        setState((current) => ({ ...current, status: "live", message: "Flux XAUUSD live connecte." }));
      });
      eventSource.addEventListener("message", (event) => {
        try {
          processMessage(JSON.parse(event.data));
        } catch {
          processMessage(event.data);
        }
      });
      eventSource.addEventListener("error", scheduleReconnect);
    }

    connect();

    return () => {
      disposed = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      close?.();
    };
  }, []);

  return useMemo(() => state, [state]);
}
