"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Candle, CandleSyncState, LiveMarketState, MarketTick, SymbolCode, Timeframe } from "@/types";
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

function createEmptyCandleSyncMap(): Record<Timeframe, CandleSyncState> {
  return timeframes.reduce(
    (accumulator, timeframe) => ({
      ...accumulator,
      [timeframe]: {
        brokerSymbol: null,
        official: false,
        reconstructed: false,
        source: null,
        updatedAt: null,
      },
    }),
    {} as Record<Timeframe, CandleSyncState>,
  );
}

const streamUrl = process.env.NEXT_PUBLIC_XAUUSD_TICK_STREAM_URL || "/api/market/xauusd/stream";
const historyUrl = process.env.NEXT_PUBLIC_XAUUSD_HISTORY_URL || "/api/market/xauusd/history";
const tickPollUrl = process.env.NEXT_PUBLIC_XAUUSD_TICK_POLL_URL || "/api/market/xauusd/tick";
const localBridgeOrigin = process.env.NEXT_PUBLIC_MT5_LOCAL_BRIDGE_ORIGIN || "http://127.0.0.1:3000";
const serverOffsetMinutes = Number(process.env.NEXT_PUBLIC_MARKET_SERVER_UTC_OFFSET_MINUTES ?? 0);

export function useLiveXauusd(symbol: SymbolCode = "XAUUSD"): LiveMarketState {
  const normalizedSymbol = symbol.toUpperCase();
  const [state, setState] = useState<LiveMarketState>({
    status: "connecting",
    message: `Connexion au flux ${normalizedSymbol} live.`,
    source: null,
    brokerSymbol: null,
    lastTick: null,
    serverOffsetMinutes: Number.isFinite(serverOffsetMinutes) ? serverOffsetMinutes : 0,
    latencyMs: null,
    candleMap: createEmptyCandleMap(),
    candleSync: createEmptyCandleSyncMap(),
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

  function processTick(tick: MarketTick, message = `Flux ${normalizedSymbol} live connecte.`, source: string | null = null) {
    if (tick.symbol && normalizeBridgeSymbol(tick.symbol) !== normalizedSymbol) {
      return;
    }

    const latencyMs = Math.max(0, Date.now() - tick.time * 1000);
    const appTick = { ...tick, symbol: normalizedSymbol };
    const sourceLabel = source ?? tick.symbol ?? "MT5 tick";
    const tickOfficial = isMt5Source(sourceLabel);

    setState((current) => {
      const candleMap = { ...current.candleMap };
      const candleSync = { ...current.candleSync };
      for (const timeframe of timeframes) {
        const previousSync = current.candleSync[timeframe];
        candleMap[timeframe] = applyTickToCandles({
          candles: current.candleMap[timeframe],
          tick: appTick,
          timeframe,
          serverOffsetMinutes: current.serverOffsetMinutes,
        });
        candleSync[timeframe] = {
          ...previousSync,
          brokerSymbol: previousSync.brokerSymbol ?? tick.symbol ?? normalizedSymbol,
          official: Boolean(previousSync.official && tickOfficial),
          reconstructed: true,
          source: previousSync.official ? `${previousSync.source ?? "MT5 Bridge"} + forming tick` : `${sourceLabel} reconstructed from ticks`,
          updatedAt: new Date().toISOString(),
        };
      }

      return {
        ...current,
        status: "live",
        message,
        source: sourceLabel,
        brokerSymbol: tick.symbol ?? current.brokerSymbol ?? normalizedSymbol,
        lastTick: appTick,
        latencyMs,
        candleMap,
        candleSync,
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

    setState({
      status: "connecting",
      message: `Connexion au flux ${normalizedSymbol} live.`,
      source: null,
      brokerSymbol: null,
      lastTick: null,
      serverOffsetMinutes: Number.isFinite(serverOffsetMinutes) ? serverOffsetMinutes : 0,
      latencyMs: null,
      candleMap: createEmptyCandleMap(),
      candleSync: createEmptyCandleSyncMap(),
    });

    async function loadHistory() {
      const results: Array<{
        brokerSymbol: string;
        candles: Candle[];
        source: string | null;
        timeframe: Timeframe;
        updatedAt: string | null;
      }> = [];

      for (const timeframe of timeframes) {
        try {
          const payload = await fetchFirstHistoryJson(endpoints.history, timeframe, normalizedSymbol);
          const source = getMarketSource(payload);
          const brokerSymbol = getMarketSymbol(payload) ?? normalizedSymbol;
          const updatedAt = getMarketUpdatedAt(payload);
          results.push({
            brokerSymbol,
            candles: normalizeHistoryCandles(payload),
            source,
            timeframe,
            updatedAt,
          });
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
        const candleSync = { ...current.candleSync };
        for (const result of results) {
          candleMap[result.timeframe] = result.candles;

          if (result.candles.length) {
            candleSync[result.timeframe] = {
              brokerSymbol: result.brokerSymbol,
              official: isMt5Source(result.source),
              reconstructed: false,
              source: result.source,
              updatedAt: result.updatedAt,
            };
          }
        }

        const loadedCount = Object.values(candleMap).reduce((total, candles) => total + candles.length, 0);
        const brokerSymbol = results.find((result) => result.brokerSymbol)?.brokerSymbol ?? current.brokerSymbol;

        return {
          ...current,
          brokerSymbol,
          candleMap,
          candleSync,
          message: loadedCount ? `Historique ${normalizedSymbol} charge, connexion au live en cours.` : current.message,
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
  }, [normalizedSymbol]);

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
        const payload = await fetchFirstJson(addSymbolToUrls(endpoints.tick, normalizedSymbol));

        processMessage(payload);
      } catch (error) {
        if (!disposed) {
          setState((current) => ({
            ...current,
            status: current.lastTick ? "reconnecting" : "error",
            message: error instanceof Error ? error.message : `Tick ${normalizedSymbol} indisponible.`,
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
        message: `Bascule sur polling HTTP ${normalizedSymbol}.`,
      }));
      pollTick();
      pollTimer = setInterval(pollTick, 2500);
    }

    function connect() {
      if (disposed) {
        return;
      }

      setState((current) => ({ ...current, status: retryRef.current ? "reconnecting" : "connecting", message: `Connexion au flux ${normalizedSymbol}.` }));

      const selectedStreamUrl = addSymbolToUrls(endpoints.stream, normalizedSymbol)[0];

      if (selectedStreamUrl.startsWith("ws")) {
        const socket = new WebSocket(selectedStreamUrl);
        close = () => socket.close();

        socket.addEventListener("open", () => {
          retryRef.current = 0;
          setState((current) => ({ ...current, status: "live", message: `Flux ${normalizedSymbol} live connecte.` }));
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
          setState((current) => ({ ...current, status: "error", message: `Erreur sur le flux WebSocket ${normalizedSymbol}.` }));
        });
        return;
      }

      const eventSource = new EventSource(selectedStreamUrl);
      close = () => eventSource.close();

      eventSource.addEventListener("open", () => {
        retryRef.current = 0;
        setState((current) => ({ ...current, status: "live", message: `Flux ${normalizedSymbol} live connecte.` }));
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
  }, [normalizedSymbol]);

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

function addSymbolToUrls(urls: string[], symbol: string) {
  return urls.map((candidate) => {
    const url = new URL(candidate, window.location.origin);
    url.searchParams.set("symbol", symbol);
    return url.toString();
  });
}

async function fetchFirstHistoryJson(urls: string[], timeframe: Timeframe, symbol: string) {
  const candidates = urls.map((candidate) => {
    const url = new URL(candidate, window.location.origin);
    url.searchParams.set("symbol", symbol);
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

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMarketMessage(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "Flux live connecte.";
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

function getMarketSymbol(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  if ("brokerSymbol" in data && data.brokerSymbol) {
    return String(data.brokerSymbol).toUpperCase();
  }

  if ("symbol" in data && data.symbol) {
    return String(data.symbol).toUpperCase();
  }

  return null;
}

function getMarketUpdatedAt(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  if ("updatedAt" in data && data.updatedAt) {
    return String(data.updatedAt);
  }

  return null;
}

function isMt5Source(source: string | null | undefined) {
  const normalized = String(source ?? "").toUpperCase();
  return normalized.includes("MT5") || normalized.includes("EXNESS") || normalized.includes("BRIDGE");
}
