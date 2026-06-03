import type { MacroContext, NewsEvent } from "@/types";

export const macroContext: MacroContext = {
  dxyDirection: "Neutral",
  us10yDirection: "Neutral",
  fedTone: "neutral",
  geopoliticalRisk: "medium",
  centralBankBuying: "stable",
};

export const newsEvents: NewsEvent[] = [
  { title: "CPI / NFP / FOMC", impact: "high", minutesAway: 999 },
  { title: "Powell speech", impact: "high", minutesAway: 999 },
  { title: "PMI / Retail Sales", impact: "medium", minutesAway: 999 },
];
