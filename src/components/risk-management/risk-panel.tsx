"use client";

import { useMemo, useState } from "react";
import { Calculator, ShieldCheck } from "lucide-react";
import type { TradePlan } from "@/types";
import { calculateLotSize, calculateMaxLoss, calculateRiskReward } from "@/lib/risk/risk";

export function RiskPanel({ plan }: { plan: TradePlan }) {
  const [capital, setCapital] = useState(10000);
  const [riskPercent, setRiskPercent] = useState(1);
  const [pipValue, setPipValue] = useState(10);
  const stopDistance = Number(Math.abs(plan.entry - plan.stopLoss).toFixed(2));

  const risk = useMemo(() => {
    const lotSize = calculateLotSize({ capital, riskPercent, stopLossDistance: stopDistance, pipValue });
    const maxLoss = calculateMaxLoss(capital, riskPercent);
    const riskReward = calculateRiskReward(plan.entry, plan.stopLoss, plan.takeProfits[0]);

    return { lotSize, maxLoss, riskReward };
  }, [capital, pipValue, plan.entry, plan.stopLoss, plan.takeProfits, riskPercent, stopDistance]);

  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/55 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Risk management</h2>
        <Calculator size={18} className="text-slate-300" />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <NumberField label="Capital" value={capital} onChange={setCapital} suffix="$" />
        <NumberField label="Risque" value={riskPercent} onChange={setRiskPercent} suffix="%" step={0.5} />
        <NumberField label="Valeur pip" value={pipValue} onChange={setPipValue} suffix="$" />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Result label="Lot recommandé" value={risk.lotSize.toFixed(2)} />
        <Result label="Perte max" value={`$${risk.maxLoss.toFixed(2)}`} />
        <Result label="RR" value={`1:${risk.riskReward.toFixed(2)}`} />
      </div>

      <div className="mt-4 rounded-md border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm leading-6 text-emerald-100">
        <div className="flex gap-2">
          <ShieldCheck size={18} className="mt-0.5 shrink-0" />
          <p>RR minimum recommandé : 1:2. Si le RR descend sous ce seuil, le score baisse et la décision reste en WAIT.</p>
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
