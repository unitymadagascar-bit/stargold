import type { DxyContext, EconomicNewsEvent, FundamentalBias, FundamentalContext, FundamentalRecommendation } from "@/types";
import { isWatchedUsdEvent } from "@/lib/fundamentals/watched-events";

const HIGH_IMPACT_BLOCK_AHEAD_MINUTES = 30;
const HIGH_IMPACT_BLOCK_AFTER_MINUTES = 15;

export function buildFundamentalContext({
  apiEvents,
  apiSource,
  apiUpdatedAt,
  dxy,
  manualEvents,
}: {
  apiEvents: EconomicNewsEvent[];
  apiSource: string;
  apiUpdatedAt: string | null;
  dxy: DxyContext;
  manualEvents: EconomicNewsEvent[];
}): FundamentalContext {
  const mode = apiEvents.length ? "api" : "manual";
  const source = apiEvents.length ? apiSource : manualEvents.length ? "Mode manuel" : "Mode manuel - aucune API configuree";
  const events = [...apiEvents, ...manualEvents]
    .filter((event) => event.currency.toUpperCase() === "USD")
    .filter((event) => isWatchedUsdEvent(event.name) || event.impact === "red")
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
  const now = Date.now();
  const nextHighImpactEvent = events.find((event) => event.impact === "red" && new Date(event.dateTime).getTime() >= now) ?? null;
  const cautionEvent = events.find((event) => {
    if (event.impact !== "red") {
      return false;
    }

    const minutes = (new Date(event.dateTime).getTime() - now) / 60000;
    return (minutes >= 0 && minutes <= HIGH_IMPACT_BLOCK_AHEAD_MINUTES) || (minutes < 0 && Math.abs(minutes) <= HIGH_IMPACT_BLOCK_AFTER_MINUTES);
  });
  const newsBias = interpretNewsBias(events);
  const dxyBias = interpretDxyBias(dxy);
  const recommendation = getFundamentalRecommendation({ caution: Boolean(cautionEvent), newsBias, dxyBias });
  const riskLevel = cautionEvent ? "eleve" : events.some((event) => event.impact === "red" && Math.abs(minutesFromNow(event)) <= 120) ? "modere" : "faible";

  return {
    mode,
    source,
    updatedAt: apiUpdatedAt,
    events,
    nextHighImpactEvent,
    caution: Boolean(cautionEvent),
    cautionMessage: cautionEvent ? "Zone de prudence : attendre confirmation price action." : null,
    usdInterpretation: getUsdInterpretation(newsBias, dxyBias),
    goldInterpretation: getGoldInterpretation(newsBias, dxyBias),
    newsBias,
    dxy,
    riskLevel,
    recommendation,
  };
}

export function interpretNewsBias(events: EconomicNewsEvent[]): FundamentalBias {
  const latestReleased = events
    .filter((event) => new Date(event.dateTime).getTime() <= Date.now())
    .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())
    .slice(0, 4);
  let usdStrong = 0;
  let usdWeak = 0;

  for (const event of latestReleased) {
    const surprise = getNumericSurprise(event);
    if (!surprise) {
      continue;
    }

    const name = event.name.toLowerCase();
    const lowerIsUsdStrong = name.includes("unemployment") || name.includes("jobless claims");
    const strongerThanExpected = surprise.actual > surprise.forecast;
    const weakerThanExpected = surprise.actual < surprise.forecast;

    if ((strongerThanExpected && !lowerIsUsdStrong) || (weakerThanExpected && lowerIsUsdStrong)) {
      usdStrong += event.impact === "red" ? 2 : 1;
    }

    if ((weakerThanExpected && !lowerIsUsdStrong) || (strongerThanExpected && lowerIsUsdStrong)) {
      usdWeak += event.impact === "red" ? 2 : 1;
    }
  }

  if (usdStrong >= usdWeak + 2) {
    return "bearish-gold";
  }

  if (usdWeak >= usdStrong + 2) {
    return "bullish-gold";
  }

  return "neutral";
}

export function interpretDxyBias(dxy: DxyContext): FundamentalBias {
  if (dxy.direction === "rising" && dxy.strength !== "weak") {
    return "bearish-gold";
  }

  if (dxy.direction === "falling" && dxy.strength !== "weak") {
    return "bullish-gold";
  }

  return "neutral";
}

export function minutesFromNow(event: EconomicNewsEvent) {
  return Math.round((new Date(event.dateTime).getTime() - Date.now()) / 60000);
}

function getNumericSurprise(event: EconomicNewsEvent) {
  const actual = parseNumericValue(event.actual);
  const forecast = parseNumericValue(event.forecast);
  const previous = parseNumericValue(event.previous);

  if (actual === null || forecast === null) {
    return null;
  }

  return { actual, forecast, previous };
}

function parseNumericValue(value: string) {
  if (!value.trim()) {
    return null;
  }

  const normalized = value.replace(/,/g, "").replace("%", "").replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getFundamentalRecommendation({
  caution,
  dxyBias,
  newsBias,
}: {
  caution: boolean;
  dxyBias: FundamentalBias;
  newsBias: FundamentalBias;
}): FundamentalRecommendation {
  if (caution) {
    return "Eviter";
  }

  if (newsBias !== "neutral" && dxyBias !== "neutral" && newsBias !== dxyBias) {
    return "Attendre";
  }

  return "Trader";
}

function getUsdInterpretation(newsBias: FundamentalBias, dxyBias: FundamentalBias) {
  if (newsBias === "bearish-gold" || dxyBias === "bearish-gold") {
    return "USD potentiellement fort : prudence sur les achats GOLD.";
  }

  if (newsBias === "bullish-gold" || dxyBias === "bullish-gold") {
    return "USD potentiellement faible : GOLD peut être soutenu.";
  }

  return "USD neutre : donner plus de poids au Price Action.";
}

function getGoldInterpretation(newsBias: FundamentalBias, dxyBias: FundamentalBias) {
  if (newsBias === "bearish-gold" || dxyBias === "bearish-gold") {
    return "GOLD sous pression probable, attendre confirmation technique.";
  }

  if (newsBias === "bullish-gold" || dxyBias === "bullish-gold") {
    return "GOLD potentiellement soutenu, BUY seulement avec confirmation.";
  }

  return "Pas d'avantage fondamental clair pour GOLD.";
}
