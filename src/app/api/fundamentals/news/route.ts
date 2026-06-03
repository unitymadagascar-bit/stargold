import { NextResponse } from "next/server";
import type { EconomicImpact, EconomicNewsEvent } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  try {
    const result = await fetchConfiguredEconomicCalendar({ from, to });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        mode: "manual",
        source: "Mode manuel",
        updatedAt: new Date().toISOString(),
        events: [],
        error: error instanceof Error ? error.message : "Economic calendar unavailable",
      },
      { status: 200 },
    );
  }
}

async function fetchConfiguredEconomicCalendar({ from, to }: { from: Date; to: Date }) {
  if (process.env.ECONOMIC_CALENDAR_API_URL) {
    const response = await fetch(process.env.ECONOMIC_CALENDAR_API_URL, { cache: "no-store" });
    const payload = await response.json();

    return {
      mode: "api",
      source: process.env.ECONOMIC_CALENDAR_SOURCE ?? "Custom economic calendar API",
      updatedAt: new Date().toISOString(),
      events: normalizeApiEvents(payload, process.env.ECONOMIC_CALENDAR_SOURCE ?? "Custom API"),
    };
  }

  if (process.env.EODHD_API_TOKEN) {
    const url = new URL("https://eodhd.com/api/economic-events");
    url.searchParams.set("api_token", process.env.EODHD_API_TOKEN);
    url.searchParams.set("fmt", "json");
    url.searchParams.set("country", "US");
    url.searchParams.set("from", toDateOnly(from));
    url.searchParams.set("to", toDateOnly(to));

    const response = await fetch(url, { cache: "no-store" });
    const payload = await response.json();

    return {
      mode: "api",
      source: "EODHD Economic Events API",
      updatedAt: new Date().toISOString(),
      events: normalizeApiEvents(payload, "EODHD"),
    };
  }

  if (process.env.FMP_API_KEY) {
    const url = new URL("https://financialmodelingprep.com/stable/economic-calendar");
    url.searchParams.set("from", toDateOnly(from));
    url.searchParams.set("to", toDateOnly(to));
    url.searchParams.set("apikey", process.env.FMP_API_KEY);

    const response = await fetch(url, { cache: "no-store" });
    const payload = await response.json();

    return {
      mode: "api",
      source: "Financial Modeling Prep Economic Calendar",
      updatedAt: new Date().toISOString(),
      events: normalizeApiEvents(payload, "FMP"),
    };
  }

  if (process.env.FXSTREET_CALENDAR_URL && process.env.FXSTREET_ACCESS_TOKEN) {
    const url = new URL(process.env.FXSTREET_CALENDAR_URL);
    url.searchParams.set("from", from.toISOString());
    url.searchParams.set("to", to.toISOString());
    url.searchParams.set("currencies", "USD");

    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${process.env.FXSTREET_ACCESS_TOKEN}`,
      },
    });
    const payload = await response.json();

    return {
      mode: "api",
      source: "FXStreet Economic Calendar API",
      updatedAt: new Date().toISOString(),
      events: normalizeApiEvents(payload, "FXStreet"),
    };
  }

  return {
    mode: "manual",
    source: "Mode manuel - aucune API calendrier configuree",
    updatedAt: null,
    events: [],
  };
}

function normalizeApiEvents(payload: unknown, fallbackSource: string): EconomicNewsEvent[] {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && "events" in payload && Array.isArray(payload.events)
      ? payload.events
      : payload && typeof payload === "object" && "data" in payload && Array.isArray(payload.data)
        ? payload.data
        : [];

  return rows
    .map((row, index) => normalizeApiEvent(row, index, fallbackSource))
    .filter((event): event is EconomicNewsEvent => Boolean(event))
    .filter((event) => event.currency.toUpperCase() === "USD")
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
}

function normalizeApiEvent(row: unknown, index: number, fallbackSource: string): EconomicNewsEvent | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  const source = row as Record<string, unknown>;
  const name = stringValue(source.name ?? source.event ?? source.title ?? source.indicator ?? source.event_name ?? source.type);
  const currency = normalizeCurrency(source.currency ?? source.currencyCode ?? source.ccy ?? source.countryCurrency ?? source.country ?? "USD");
  const dateTime = stringValue(source.dateTime ?? source.date ?? source.datetime ?? source.timestamp ?? source.time);

  if (!name || !dateTime) {
    return null;
  }

  return {
    id: stringValue(source.id ?? source.eventId ?? `${fallbackSource}-${index}-${dateTime}-${name}`),
    name,
    currency,
    dateTime: normalizeDate(dateTime),
    impact: normalizeImpact(source.impact ?? source.importance ?? source.volatility ?? source.priority),
    actual: stringValue(source.actual ?? source.actualValue ?? source.actual_value),
    forecast: stringValue(source.forecast ?? source.consensus ?? source.estimate ?? source.forecastValue),
    previous: stringValue(source.previous ?? source.previousValue ?? source.prior),
    source: stringValue(source.source ?? fallbackSource),
    notes: stringValue(source.notes ?? source.description ?? source.comment),
  };
}

function normalizeImpact(value: unknown): EconomicImpact {
  const text = stringValue(value).toLowerCase();
  if (text.includes("red") || text.includes("high") || text === "3") {
    return "red";
  }

  if (text.includes("orange") || text.includes("medium") || text === "2") {
    return "orange";
  }

  return "yellow";
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function normalizeCurrency(value: unknown) {
  const text = stringValue(value).toUpperCase();
  if (text === "US" || text === "USA" || text === "UNITED STATES") {
    return "USD";
  }

  return text || "USD";
}

function normalizeDate(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value;
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}
