import type { Timeframe } from "@/types";

export const timeframes: Timeframe[] = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"];

export const timeframeSeconds: Record<Timeframe, number> = {
  M1: 60,
  M5: 5 * 60,
  M15: 15 * 60,
  M30: 30 * 60,
  H1: 60 * 60,
  H4: 4 * 60 * 60,
  D1: 24 * 60 * 60,
};

export function getTimeframeLabel(timeframe: Timeframe) {
  return timeframe === "D1" ? "D1" : timeframe;
}
