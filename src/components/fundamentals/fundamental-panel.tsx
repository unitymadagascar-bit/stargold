"use client";

import { useState } from "react";
import { DatabaseZap, Plus, Trash2, Upload } from "lucide-react";
import type { DxyContext, EconomicImpact, EconomicNewsEvent, FundamentalContext } from "@/types";
import { minutesFromNow } from "@/lib/fundamentals/interpretation";

const emptyEvent = {
  name: "",
  currency: "USD",
  dateTime: "",
  impact: "red" as EconomicImpact,
  actual: "",
  forecast: "",
  previous: "",
  source: "Mode manuel",
  notes: "",
};

export function FundamentalPanel({
  apiError,
  fundamental,
  manualEvents,
  onAddManualEvent,
  onImportManualEvents,
  onRemoveManualEvent,
  onUpdateDxy,
}: {
  apiError: string | null;
  fundamental: FundamentalContext;
  manualEvents: EconomicNewsEvent[];
  onAddManualEvent: (event: EconomicNewsEvent) => void;
  onImportManualEvents: (events: EconomicNewsEvent[]) => void;
  onRemoveManualEvent: (id: string) => void;
  onUpdateDxy: (dxy: DxyContext) => void;
}) {
  const [form, setForm] = useState(emptyEvent);
  const [importText, setImportText] = useState("");
  const [dxyDirection, setDxyDirection] = useState<DxyContext["direction"]>(fundamental.dxy.direction);
  const [dxyStrength, setDxyStrength] = useState<DxyContext["strength"]>(fundamental.dxy.strength);

  function submitEvent() {
    if (!form.name.trim() || !form.dateTime) {
      return;
    }

    onAddManualEvent({
      ...form,
      id: `manual-${crypto.randomUUID()}`,
      dateTime: new Date(form.dateTime).toISOString(),
    });
    setForm(emptyEvent);
  }

  function submitImport() {
    try {
      const parsed = JSON.parse(importText) as EconomicNewsEvent[];
      if (Array.isArray(parsed)) {
        onImportManualEvents(
          parsed.map((event, index) => ({
            ...event,
            id: event.id || `import-${Date.now()}-${index}`,
            currency: event.currency || "USD",
            source: event.source || "Import manuel",
          })),
        );
        setImportText("");
      }
    } catch {
      setImportText(importText);
    }
  }

  return (
    <section className="rounded-lg border border-white/10 bg-[#0b1017]/90 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Contexte Fondamental USD/GOLD</h2>
          <p className="mt-1 text-xs text-slate-500">Source : {fundamental.source}</p>
          <p className="text-xs text-slate-500">Dernière mise à jour : {formatDate(fundamental.updatedAt)}</p>
        </div>
        <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${fundamental.recommendation === "Trader" ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100" : fundamental.recommendation === "Eviter" ? "border-rose-300/30 bg-rose-300/10 text-rose-100" : "border-amber-300/30 bg-amber-300/10 text-amber-100"}`}>
          {fundamental.recommendation}
        </span>
      </div>

      {apiError ? <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">{apiError}</p> : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Info label="Prochaine news USD" value={fundamental.nextHighImpactEvent?.name ?? "Aucune news rouge connue"} />
        <Info label="Temps restant" value={fundamental.nextHighImpactEvent ? `${minutesFromNow(fundamental.nextHighImpactEvent)} min` : "--"} />
        <Info label="Impact" value={fundamental.nextHighImpactEvent?.impact ?? "--"} />
        <Info label="Actual / Forecast / Previous" value={fundamental.nextHighImpactEvent ? `${fallback(fundamental.nextHighImpactEvent.actual)} / ${fallback(fundamental.nextHighImpactEvent.forecast)} / ${fallback(fundamental.nextHighImpactEvent.previous)}` : "--"} />
        <Info label="Interprétation USD" value={fundamental.usdInterpretation} wide />
        <Info label="Interprétation GOLD" value={fundamental.goldInterpretation} wide />
        <Info label="Niveau de risque" value={fundamental.riskLevel} />
        <Info label="Mode" value={fundamental.mode === "api" ? "API + manuel" : "manuel"} />
      </div>

      {fundamental.cautionMessage ? <p className="mt-3 rounded-md border border-rose-300/25 bg-rose-300/10 px-3 py-2 text-sm font-medium text-rose-100">{fundamental.cautionMessage}</p> : null}

      <div className="mt-4 rounded-md border border-white/10 bg-black/20 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <DatabaseZap size={16} />
          DXY
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <select className="rounded-md border border-white/10 bg-[#080b10] px-3 py-2 text-sm text-slate-200" value={dxyDirection} onChange={(event) => setDxyDirection(event.target.value as DxyContext["direction"])}>
            <option value="unknown">Non renseigné</option>
            <option value="rising">DXY monte</option>
            <option value="falling">DXY baisse</option>
            <option value="range">DXY range</option>
          </select>
          <select className="rounded-md border border-white/10 bg-[#080b10] px-3 py-2 text-sm text-slate-200" value={dxyStrength} onChange={(event) => setDxyStrength(event.target.value as DxyContext["strength"])}>
            <option value="weak">Faible</option>
            <option value="moderate">Modéré</option>
            <option value="strong">Fort</option>
          </select>
          <button className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-200" type="button" onClick={() => onUpdateDxy({ direction: dxyDirection, strength: dxyStrength, value: null, source: "Mode manuel", updatedAt: new Date().toISOString() })}>
            Appliquer
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-md border border-white/10 bg-black/20 p-3">
        <h3 className="text-sm font-semibold text-white">Mode manuel news</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <TextInput label="Nom de la news" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
          <TextInput label="Devise" value={form.currency} onChange={(value) => setForm((current) => ({ ...current, currency: value.toUpperCase() }))} />
          <TextInput label="Heure/date" type="datetime-local" value={form.dateTime} onChange={(value) => setForm((current) => ({ ...current, dateTime: value }))} />
          <label className="text-xs text-slate-500">
            Impact
            <select className="mt-1 w-full rounded-md border border-white/10 bg-[#080b10] px-3 py-2 text-sm text-slate-200" value={form.impact} onChange={(event) => setForm((current) => ({ ...current, impact: event.target.value as EconomicImpact }))}>
              <option value="red">Rouge</option>
              <option value="orange">Orange</option>
              <option value="yellow">Jaune</option>
            </select>
          </label>
          <TextInput label="Actual" value={form.actual} onChange={(value) => setForm((current) => ({ ...current, actual: value }))} />
          <TextInput label="Forecast" value={form.forecast} onChange={(value) => setForm((current) => ({ ...current, forecast: value }))} />
          <TextInput label="Previous" value={form.previous} onChange={(value) => setForm((current) => ({ ...current, previous: value }))} />
          <TextInput label="Source" value={form.source} onChange={(value) => setForm((current) => ({ ...current, source: value }))} />
          <TextInput label="Notes" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} wide />
        </div>
        <button className="mt-3 inline-flex items-center gap-2 rounded-md border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-sm font-medium text-emerald-100" type="button" onClick={submitEvent}>
          <Plus size={15} />
          Ajouter
        </button>
      </div>

      <div className="mt-4 rounded-md border border-white/10 bg-black/20 p-3">
        <h3 className="text-sm font-semibold text-white">Importer JSON</h3>
        <textarea
          className="mt-2 min-h-24 w-full rounded-md border border-white/10 bg-[#080b10] px-3 py-2 font-mono text-xs text-slate-200 outline-none"
          placeholder='[{"name":"CPI","currency":"USD","dateTime":"2026-06-03T12:30:00Z","impact":"red","actual":"","forecast":"3.4%","previous":"3.2%","source":"Forex Factory","notes":""}]'
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
        />
        <button className="mt-2 inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-200" type="button" onClick={submitImport}>
          <Upload size={15} />
          Importer
        </button>
      </div>

      {manualEvents.length ? (
        <div className="mt-4 space-y-2">
          {manualEvents.slice(0, 5).map((event) => (
            <div key={event.id} className="flex items-start justify-between gap-3 rounded-md bg-black/25 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-slate-200">{event.name}</p>
                <p className="text-xs text-slate-500">{event.currency} · {event.impact} · {formatDate(event.dateTime)} · {event.source}</p>
              </div>
              <button aria-label={`Supprimer ${event.name}`} className="grid size-8 place-items-center rounded border border-white/10 text-slate-400 hover:text-rose-200" type="button" onClick={() => onRemoveManualEvent(event.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <p className="mt-4 border-t border-white/10 pt-3 text-xs leading-5 text-slate-400">
        Ces analyses sont des indicateurs d'aide à la décision, pas des garanties. Le trading comporte des risques et nécessite une gestion stricte du capital.
      </p>
    </section>
  );
}

function Info({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-md bg-black/25 px-3 py-2 ${wide ? "sm:col-span-2" : ""}`}>
      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm leading-5 text-slate-200">{value}</p>
    </div>
  );
}

function TextInput({
  label,
  onChange,
  type = "text",
  value,
  wide = false,
}: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <label className={`text-xs text-slate-500 ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      <input
        className="mt-1 w-full rounded-md border border-white/10 bg-[#080b10] px-3 py-2 text-sm text-slate-200 outline-none"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleString("fr-FR", { hour12: false });
}

function fallback(value: string) {
  return value.trim() || "--";
}
