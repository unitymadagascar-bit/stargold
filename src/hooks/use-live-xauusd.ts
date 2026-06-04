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
const localBridgeOrigin = process.env.NEXT_PUBLIC_MT5_LOCAL_BRIDGE_ORIGIN || "http://127.0.0.1:3000";
const serverOffsetMinutes = Number(process.env.NEXT_PUBLIC_MARKET_SERVER_UTC_OFFSET_MINUTES ?? 0);

export function useLiveXauusd(): LiveMarketState {
  const [state, setState] = useState<LiveMarketState>({
    status: "connecting",
    message: "Connexion au flux XAUUSD live.",
    source: null,
    lastTick: null,
    serverOffsetMinutes: Number.isFinite(serverOffsetMinutes) ? serverOffsetMinutes : 0,
    latencyMs: null,
    candleMap: createEmptyCandleMap(),
  });
  const retryRef = useRef(0);
  const endpoints = useMemo(
    () => ({
      history: getEndpointCandidates(historyUrl),
      stream: getEndpointCandidates(streamUrl),
      tick: getEndpointCandidates(tickPollUrl),
    }),
    [],
  );

  function processTick(tick: MarketTick, message = "Flux XAUUSD live connecte.", source: string | null = null) {
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
        source,
        lastTick: tick,
        latencyMs,
        candleMap,
      };
    });
  }

  function processMessage(data: unknown, message?: string) {
    const marketMessage = message ?? getMarketMessage(data);
    const marketSource = getMarketSource(data);

    if (Array.isArray(data)) {
      for (const item of data) {
        const tick = normalizeProviderTick(item);
        if (tick) {
          processTick(tick, marketMessage, marketSource);
        }
      }
      return;
    }

    const tick = normalizeProviderTick(data);
    if (tick) {
      processTick(tick, marketMessage, marketSource);
    }
  }

  useEffect(() => {
    let disposed = false;

    async function loadHistory() {
      const results: Array<readonly [Timeframe, Candle[]]> = [];

      for (const timeframe of timeframes) {
        try {
          const payload = await fetchFirstHistoryJson(endpoints.history, timeframe);
          results.push([timeframe, normalizeHistoryCandles(payload)] as const);
          await wait(120);
        } catch {
          await wait(350);
        }
      }

      if (disposed) {
        return;
      }

      setState((current) => {
        const candleMap = { ...current.candleMap };
        for (const result of results) {
          candleMap[result[0]] = result[1];
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
        const payload = await fetchFirstJson(endpoints.tick);

        processMessage(payload);
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

      const selectedStreamUrl = endpoints.stream[0];

      if (selectedStreamUrl.startsWith("ws")) {
        const socket = new WebSocket(selectedStreamUrl);
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

      const eventSource = new EventSource(selectedStreamUrl);
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
      eventSource.addEventListener("market-error", (event) => {
        const messageEvent = event as MessageEvent;

        try {
          const payload = JSON.parse(messageEvent.data);
          setState((current) => ({
            ...current,
          status: current.lastTick ? "reconnecting" : "error",
          message: payload?.message ?? "MT5 non connecte.",
          source: payload?.source ? String(payload.source) : current.source,
        }));
        } catch {
          setState((current) => ({
            ...current,
            status: current.lastTick ? "reconnecting" : "error",
            message: "MT5 non connecte.",
            source: current.source,
          }));
        }
      });
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

async function fetchFirstJson(urls: string[]) {
  const errors: string[] = [];

  for (const candidate of urls) {
    try {
      const response = await fetch(new URL(candidate, window.location.origin).toString(), { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }

      return payload;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(errors.at(-1) ?? "Bridge MT5 inaccessible.");
}

async function fetchFirstHistoryJson(urls: string[], timeframe: Timeframe) {
  const candidates = urls.map((candidate) => {
    const url = new URL(candidate, window.location.origin);
    url.searchParams.set("symbol", "XAUUSD");
    url.searchParams.set("timeframe", timeframe);
    url.searchParams.set("limit", "600");
    return url.toString();
  });

  return fetchFirstJson(candidates);
}

function getEndpointCandidates(pathOrUrl: string) {
  if (pathOrUrl.startsWith("http") || pathOrUrl.startsWith("ws")) {
    return [pathOrUrl];
  }

  if (typeof window === "undefined" || !isLocalHost(window.location.hostname)) {
    return [pathOrUrl];
  }

  return [pathOrUrl, `${localBridgeOrigin}${pathOrUrl}`];
}

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMarketMessage(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "Flux XAUUSD live connecte.";
  }

  const source = "source" in data ? String(data.source) : "marche";
  const warning = "warning" in data && data.warning ? String(data.warning) : "";

  if (warning) {
    return `Flux reel ${source} actif. ${warning}`;
  }

  return `Flux reel ${source} actif.`;
}

function getMarketSource(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  if ("source" in data && data.source) {
    return String(data.source);
  }

  return null;
}
