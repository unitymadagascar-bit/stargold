import type { Candle, MarketTick, Timeframe } from "@/types";

export interface Mt5LiveEvent {
  brokerSymbol: string;
  candleCounts: Record<Timeframe, number>;
  currentCandles: Partial<Record<Timeframe, Candle>>;
  lastClosedCandles: Partial<Record<Timeframe, Candle>>;
  source: string;
  symbol: string;
  tick: MarketTick;
  updatedAt: string;
}

type Mt5LiveListener = (event: Mt5LiveEvent) => void;

interface Mt5LiveGlobal {
  __tradetsrMt5LiveBus?: {
    listeners: Set<Mt5LiveListener>;
    latest: Record<string, Mt5LiveEvent>;
  };
}

function getBus() {
  const globalStore = globalThis as Mt5LiveGlobal;

  if (!globalStore.__tradetsrMt5LiveBus) {
    globalStore.__tradetsrMt5LiveBus = {
      latest: {},
      listeners: new Set(),
    };
  }

  return globalStore.__tradetsrMt5LiveBus;
}

export function publishMt5LiveEvent(event: Mt5LiveEvent) {
  const bus = getBus();
  bus.latest[event.symbol] = event;

  for (const listener of bus.listeners) {
    listener(event);
  }
}

export function subscribeMt5LiveEvents(listener: Mt5LiveListener) {
  const bus = getBus();
  bus.listeners.add(listener);
  return () => bus.listeners.delete(listener);
}

export function getLatestMt5LiveEvent(symbol: string) {
  return getBus().latest[symbol] ?? null;
}
