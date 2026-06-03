"use client";

import { useEffect, useMemo, useState } from "react";
import type { DxyContext, EconomicNewsEvent, FundamentalContext } from "@/types";
import { buildFundamentalContext } from "@/lib/fundamentals/interpretation";

const MANUAL_EVENTS_STORAGE_KEY = "tradetsr.manualUsdNews";
const MANUAL_DXY_STORAGE_KEY = "tradetsr.manualDxy";

const defaultDxy: DxyContext = {
  direction: "unknown",
  strength: "weak",
  value: null,
  source: "Mode manuel",
  updatedAt: null,
};

interface ApiNewsResponse {
  mode: "api" | "manual";
  source: string;
  updatedAt: string | null;
  events: EconomicNewsEvent[];
}

export function useFundamentalContext() {
  const [apiNews, setApiNews] = useState<ApiNewsResponse>({ mode: "manual", source: "Chargement", updatedAt: null, events: [] });
  const [manualEvents, setManualEvents] = useState<EconomicNewsEvent[]>([]);
  const [manualDxy, setManualDxy] = useState<DxyContext>(defaultDxy);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const savedEvents = window.localStorage.getItem(MANUAL_EVENTS_STORAGE_KEY);
      const savedDxy = window.localStorage.getItem(MANUAL_DXY_STORAGE_KEY);

      if (savedEvents) {
        setManualEvents(JSON.parse(savedEvents) as EconomicNewsEvent[]);
      }

      if (savedDxy) {
        setManualDxy({ ...defaultDxy, ...(JSON.parse(savedDxy) as DxyContext) });
      }
    } catch {
      setManualEvents([]);
      setManualDxy(defaultDxy);
    }
  }, []);

  useEffect(() => {
    let disposed = false;

    async function loadNews() {
      try {
        const response = await fetch("/api/fundamentals/news", { cache: "no-store" });
        const payload = (await response.json()) as ApiNewsResponse & { error?: string };

        if (!disposed) {
          setApiNews({
            mode: payload.mode,
            source: payload.source,
            updatedAt: payload.updatedAt,
            events: payload.events ?? [],
          });
          setApiError(payload.error ?? null);
        }
      } catch (error) {
        if (!disposed) {
          setApiError(error instanceof Error ? error.message : "Impossible de charger le calendrier économique.");
          setApiNews({ mode: "manual", source: "Mode manuel", updatedAt: null, events: [] });
        }
      }
    }

    loadNews();
    const interval = window.setInterval(loadNews, 5 * 60 * 1000);

    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(MANUAL_EVENTS_STORAGE_KEY, JSON.stringify(manualEvents));
  }, [manualEvents]);

  useEffect(() => {
    window.localStorage.setItem(MANUAL_DXY_STORAGE_KEY, JSON.stringify(manualDxy));
  }, [manualDxy]);

  const fundamental = useMemo<FundamentalContext>(
    () =>
      buildFundamentalContext({
        apiEvents: apiNews.events,
        apiSource: apiNews.source,
        apiUpdatedAt: apiNews.updatedAt,
        dxy: manualDxy,
        manualEvents,
      }),
    [apiNews.events, apiNews.source, apiNews.updatedAt, manualDxy, manualEvents],
  );

  function addManualEvent(event: EconomicNewsEvent) {
    setManualEvents((current) => [event, ...current].slice(0, 80));
  }

  function importManualEvents(events: EconomicNewsEvent[]) {
    setManualEvents((current) => [...events, ...current].slice(0, 120));
  }

  function removeManualEvent(id: string) {
    setManualEvents((current) => current.filter((event) => event.id !== id));
  }

  function updateDxy(dxy: DxyContext) {
    setManualDxy({ ...dxy, updatedAt: new Date().toISOString() });
  }

  return {
    apiError,
    apiNews,
    fundamental,
    manualEvents,
    addManualEvent,
    importManualEvents,
    removeManualEvent,
    updateDxy,
  };
}
