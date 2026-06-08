"use client";

import { useMemo } from "react";
import { Calculator, ShieldCheck } from "lucide-react";
import type { RiskSettings, TradePlan } from "@/types";
import { calculateLotSize, calculateMaxLoss, calculateRiskReward } from "@/lib/risk/risk";

export function RiskPanel({ onSettingsChange, plan, settings }: { onSettingsChange: (settings: RiskSettings) => void; plan: TradePlan; settings: RiskSettings }) {
  const stopDistance = Number(Math.abs(plan.entry - plan.stopLoss).toFixed(2));

  const risk = useMemo(() => {
    const lotSize = calculateLotSize({ capital: settings.capital, riskPercent: settings.riskPercent, stopLossDistance: stopDistance, pipValue: settings.pipValue });
    const maxLoss = calculateMaxLoss(settings.capital, settings.riskPercent);
    const maxDailyLoss = calculateMaxLoss(settings.capital, settings.maxDailyLossPercent);
    const riskReward = calculateRiskReward(plan.entry, plan.stopLoss, plan.takeProfits[0]);

    return { lotSize, maxDailyLoss, maxLoss, riskReward };
  }, [plan.entry, plan.stopLoss, plan.takeProfits, settings.capital, settings.maxDailyLossPercent, settings.pipValue, settings.riskPercent, stopDistance]);

  function update<K extends keyof RiskSettings>(key: K, value: RiskSettings[K]) {
    onSettingsChange({ ...settings, [key]: value });
  }

  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/55 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Risk management</h2>
        <Calculator size={18} className="text-slate-300" />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <NumberField label="Capital" value={settings.capital} onChange={(value) => update("capital", value)} suffix="$" />
        <NumberField label="Risque/trade" value={settings.riskPercent} onChange={(value) => update("riskPercent", value)} suffix="%" step={0.5} />
        <NumberField label="Valeur pip" value={settings.pipValue} onChange={(value) => update("pipValue", value)} suffix="$" />
        <NumberField label="Perte max jour" value={settings.maxDailyLossPercent} onChange={(value) => update("maxDailyLossPercent", value)} suffix="%" step={0.5} />
        <NumberField label="Lot min broker" value={settings.minLot} onChange={(value) => update("minLot", value)} suffix="lot" step={0.01} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Result label="Lot recommande" value={risk.lotSize.toFixed(2)} />
        <Result label="Perte max" value={`$${risk.maxLoss.toFixed(2)}`} />
        <Result label="Perte max jour" value={`$${risk.maxDailyLoss.toFixed(2)}`} />
        <Result label="RR" value={`1:${risk.riskReward.toFixed(2)}`} />
      </div>

      {plan.accountRisk.riskWarning ? (
        <div className="mt-4 rounded-md border border-rose-300/20 bg-rose-300/10 p-3 text-sm font-semibold leading-6 text-rose-100">
          {plan.accountRisk.riskWarning}
        </div>
      ) : null}

      <div className="mt-4 rounded-md border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm leading-6 text-emerald-100">
        <div className="flex gap-2">
          <ShieldCheck size={18} className="mt-0.5 shrink-0" />
          <p>Le capital adapte la taille de position, la perte max et peut bloquer l'execution si le risque ne respecte pas le lot minimum ou la limite journaliere.</p>
        </div>
      </div>
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  step = 100,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix: string;
  step?: number;
}) {
  return (
    <label className="block rounded-md bg-slate-900/70 px-3 py-2">
      <span className="text-xs uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <span className="mt-2 flex items-center gap-2">
        <input
          className="w-full bg-transparent font-mono text-sm text-white outline-none"
          min={0}
          step={step}
          type="number"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="text-xs text-slate-500">{suffix}</span>
      </span>
    </label>
  );
}

function Result({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-slate-900/75 px-3 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-lg text-white">{value}</p>
    </div>
  );
}
