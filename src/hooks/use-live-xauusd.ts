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

const streamUrl = process.env.NEXT_PUBLIC_XAUUSD_TICK_STREAM_URL || "/api/market/xauusd/stream";
const historyUrl = process.env.NEXT_PUBLIC_XAUUSD_HISTORY_URL || "/api/market/xauusd/history";
const tickPollUrl = process.env.NEXT_PUBLIC_XAUUSD_TICK_POLL_URL || "/api/market/xauusd/tick";
const serverOffsetMinutes = Number(process.env.NEXT_PUBLIC_MARKET_SERVER_UTC_OFFSET_MINUTES ?? 0);

export function useLiveXauusd(): LiveMarketState {
  const [state, setState] = useState<LiveMarketState>({
    status: "connecting",
    message: "Connexion au flux XAUUSD live.",
    lastTick: null,
    serverOffsetMinutes: Number.isFinite(serverOffsetMinutes) ? serverOffsetMinutes : 0,
    latencyMs: null,
    candleMap: createEmptyCandleMap(),
  });
  const retryRef = useRef(0);

  function processTick(tick: MarketTick, message = "Flux XAUUSD live connecte.") {
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
        message,
        lastTick: tick,
        latencyMs,
        candleMap,
      };
    });
  }

  function processMessage(data: unknown, message?: string) {
    if (Array.isArray(data)) {
      for (const item of data) {
        const tick = normalizeProviderTick(item);
        if (tick) {
          processTick(tick, message);
        }
      }
      return;
    }

    const tick = normalizeProviderTick(data);
    if (tick) {
      processTick(tick, message);
    }
  }

  useEffect(() => {
    let disposed = false;

    async function loadHistory() {
      const results = await Promise.allSettled(
        timeframes.map(async (timeframe) => {
          const url = new URL(historyUrl, window.location.origin);
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

        const loadedCount = Object.values(candleMap).reduce((total, candles) => total + candles.length, 0);

        return {
          ...current,
          candleMap,
          message: loadedCount ? "Historique XAUUSD charge, connexion au live en cours." : current.message,
        };
      });
    }

    loadHistory().catch((error: unknown) => {
      if (!disposed) {
        setState((current) => ({
          ...current,
          status: current.status === "live" ? "live" : "error",
          message: error instanceof Error ? error.message : "Impossible de charger l'historique.",
        }));
      }
    });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let close: (() => void) | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let pollingStarted = false;

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

    async function pollTick() {
      try {
        const response = await fetch(tickPollUrl, { cache: "no-store" });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error ?? `Tick HTTP ${response.status}`);
        }

        processMessage(payload, "Flux EODHD HTTP actif. WebSocket indisponible ou non autorise.");
      } catch (error) {
        if (!disposed) {
          setState((current) => ({
            ...current,
            status: current.lastTick ? "reconnecting" : "error",
            message: error instanceof Error ? error.message : "Tick XAUUSD indisponible.",
          }));
        }
      }
    }

    function startPolling() {
      if (disposed || pollingStarted) {
        return;
      }

      pollingStarted = true;
      setState((current) => ({
        ...current,
        status: current.lastTick ? "reconnecting" : "connecting",
        message: "Bascule sur polling HTTP XAUUSD.",
      }));
      pollTick();
      pollTimer = setInterval(pollTick, 2500);
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
      const handleEventSourceMessage = (event: Event) => {
        const messageEvent = event as MessageEvent;
        try {
          processMessage(JSON.parse(messageEvent.data));
        } catch {
          processMessage(messageEvent.data);
        }
      };
      eventSource.addEventListener("message", handleEventSourceMessage);
      eventSource.addEventListener("tick", handleEventSourceMessage);
      eventSource.addEventListener("error", () => {
        close?.();
        startPolling();
      });
    }

    connect();

    return () => {
      disposed = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      if (pollTimer) {
        clearInterval(pollTimer);
      }
      close?.();
    };
  }, []);

  return useMemo(() => state, [state]);
}
