"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Activity, AlertTriangle, Clock, Gauge, LineChart, Radio, ShieldCheck, Target } from "lucide-react";
import type { Timeframe } from "@/types";
import { GoldChart } from "@/components/chart/gold-chart";
import { FundamentalPanel } from "@/components/fundamentals/fundamental-panel";
import { RiskPanel } from "@/components/risk-management/risk-panel";
import { ScoreBar } from "@/components/ui/score-bar";
import { SignalBadge } from "@/components/ui/signal-badge";
import { TimeframeGrid } from "@/components/timeframe-cards/timeframe-grid";
import { TradeChecklist } from "@/components/dashboard/trade-checklist";
import { useFundamentalContext } from "@/hooks/use-fundamental-context";
import { useLiveXauusd } from "@/hooks/use-live-xauusd";
import { buildLiveTimeframeAnalyses, buildLiveTradePlan, getLatestPrice } from "@/lib/analysis/live-analysis";
import { macroContext, newsEvents } from "@/lib/static-context";

export function MainDashboard() {
  const live = useLiveXauusd();
  const fundamentals = useFundamentalContext();
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>("M15");
  const timeframeAnalyses = useMemo(
    () => buildLiveTimeframeAnalyses({ candleMap: live.candleMap, fundamental: fundamentals.fundamental, macro: macroContext, news: newsEvents }),
    [fundamentals.fundamental, live.candleMap],
  );
  const plan = useMemo(
    () => buildLiveTradePlan({ candleMap: live.candleMap, fundamental: fundamentals.fundamental, macro: macroContext, news: newsEvents }),
    [fundamentals.fundamental, live.candleMap],
  );
  const latestPrice = getLatestPrice(live.candleMap);
  const activeCandles = live.candleMap[activeTimeframe];
  const activeAnalysis = timeframeAnalyses.find((item) => item.timeframe === activeTimeframe);
  const spread = live.lastTick?.bid !== undefined && live.lastTick.ask !== undefined ? Math.abs(live.lastTick.ask - live.lastTick.bid) : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1760px] px-3 py-3 sm:px-5 lg:px-6">
      <header className="rounded-lg border border-white/10 bg-[#0b1017]/90 p-4 shadow-[0_16px_50px_rgba(0,0,0,0.22)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-amber-200">TradeTSR XAUUSD live assistant</p>
            <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">XAUUSD / GOLD</h1>
            <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-400">
              Cette application est un outil d'aide à l'analyse. Elle ne garantit aucun résultat. Le trading comporte des risques importants.
              Utilisez toujours une bonne gestion du risque.
            </p>
          </div>
          <StatusPill status={live.status} message={live.message} />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SummaryCard icon={<Radio size={18} />} label="Prix XAUUSD" value={latestPrice ? latestPrice.toFixed(2) : "--"} helper="Dernier tick live" />
          <SummaryCard icon={<Gauge size={18} />} label="Score global" value={`${plan.score}/100`} helper="Confluence live" />
          <SummaryCard icon={<LineChart size={18} />} label="Biais global" value={plan.direction} helper="Basé sur H1 puis M15" />
          <SummaryCard icon={<Target size={18} />} label="Décision" value={<SignalBadge signal={plan.decision} />} helper="Confirmation obligatoire" />
          <SummaryCard
            icon={<Clock size={18} />}
            label="Latence / spread"
            value={`${live.latencyMs ?? "--"}ms`}
            helper={spread ? `Spread ${spread.toFixed(2)}` : `Offset serveur ${live.serverOffsetMinutes} min`}
          />
        </div>
      </header>

      <section className="mt-3">
        <TimeframeGrid analyses={timeframeAnalyses} />
      </section>

      <section className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_390px]">
        <GoldChart
          candleMap={live.candleMap}
          connectionMessage={live.message}
          connectionStatus={live.status}
          plan={plan}
          timeframe={activeTimeframe}
          onTimeframeChange={setActiveTimeframe}
        />

        <aside className="space-y-3">
          <section className="rounded-lg border border-white/10 bg-[#0b1017]/90 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">Détails setup</h2>
                <p className="mt-1 text-xs text-slate-500">{activeTimeframe} · {activeCandles.length} bougies live</p>
              </div>
              <SignalBadge signal={activeAnalysis?.signal ?? "WAIT"} />
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-300">{plan.summary}</p>
            <div className="mt-4">
              <ScoreBar value={activeAnalysis?.score ?? 0} compact />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <SetupMetric label="Trend" value={activeAnalysis?.trend ?? "range"} />
              <SetupMetric label="Structure" value={activeAnalysis?.structure ?? "range"} />
              <SetupMetric label="RSI" value={(activeAnalysis?.rsi ?? 50).toFixed(1)} />
              <SetupMetric label="ATR" value={(activeAnalysis?.atr ?? 0).toFixed(2)} />
              <SetupMetric label="Sweep" value={activeAnalysis?.liquiditySweep ? "confirmé" : "attente"} />
              <SetupMetric label="Retest" value={activeAnalysis?.retestConfirmed ? "confirmé" : "attente"} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <SetupMetric label="Price Action" value={`${plan.scoring.priceAction ?? plan.scoring.technical}/40`} />
              <SetupMetric label="Structure" value={`${plan.scoring.marketStructure ?? plan.scoring.orderFlow}/20`} />
              <SetupMetric label="DXY" value={`${plan.scoring.dxy ?? 0}/15`} />
              <SetupMetric label="News USD" value={`${plan.scoring.news ?? 0}/15`} />
              <SetupMetric label="Risque" value={`${plan.scoring.volatilityRisk ?? plan.scoring.risk}/10`} />
              <SetupMetric label="Total" value={`${plan.score}/100`} />
            </div>
          </section>

          <TradeChecklist />

          <section className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-4">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 shrink-0 text-amber-200" size={18} />
              <p className="text-sm leading-6 text-amber-100">
                Si le flux live n'est pas connecté, aucun signal agressif ne doit être utilisé. Les bougies du graphique ne sont plus simulées.
              </p>
            </div>
          </section>

          <FundamentalPanel
            apiError={fundamentals.apiError}
            fundamental={fundamentals.fundamental}
            manualEvents={fundamentals.manualEvents}
            onAddManualEvent={fundamentals.addManualEvent}
            onImportManualEvents={fundamentals.importManualEvents}
            onRemoveManualEvent={fundamentals.removeManualEvent}
            onUpdateDxy={fundamentals.updateDxy}
          />
        </aside>
      </section>

      <section className="mt-3 grid gap-3 xl:grid-cols-4">
        <ExecutionBlock title="Zones clés" icon={<Activity size={18} />}>
          <BlockRow label="Support proche" value={formatPrice(activeAnalysis?.support)} />
          <BlockRow label="Résistance proche" value={formatPrice(activeAnalysis?.resistance)} />
          <BlockRow label="Volatilité" value={activeAnalysis?.volatility ?? "attente"} />
        </ExecutionBlock>

        <ExecutionBlock title="Entrée / SL" icon={<ShieldCheck size={18} />}>
          <BlockRow label="Entry" value={formatPrice(plan.entry)} />
          <BlockRow label="Stop loss" value={formatPrice(plan.stopLoss)} />
          <BlockRow label="Décision" value={plan.decision} />
        </ExecutionBlock>

        <ExecutionBlock title="Take profits" icon={<Target size={18} />}>
          <BlockRow label="TP1" value={formatPrice(plan.takeProfits[0])} />
          <BlockRow label="TP2" value={formatPrice(plan.takeProfits[1])} />
          <BlockRow label="TP3" value={formatPrice(plan.takeProfits[2])} />
        </ExecutionBlock>

        <ExecutionBlock title="RR / lot size" icon={<Gauge size={18} />}>
          <BlockRow label="Risk/Reward" value={plan.riskReward ? `1:${plan.riskReward.toFixed(2)}` : "--"} />
          <BlockRow label="Lot size" value={plan.lotSize ? plan.lotSize.toFixed(2) : "--"} />
          <BlockRow label="Score risque" value={`${plan.scoring.volatilityRisk ?? plan.scoring.risk}/10`} />
        </ExecutionBlock>
      </section>

      <section className="mt-3">
        <RiskPanel plan={plan} />
      </section>
    </main>
  );
}

function StatusPill({ status, message }: { status: string; message: string }) {
  const live = status === "live";
  return (
    <div className={`flex max-w-xl items-center gap-3 rounded-lg border px-4 py-3 ${live ? "border-emerald-300/25 bg-emerald-300/10" : "border-amber-300/25 bg-amber-300/10"}`}>
      <span className={`size-2.5 rounded-full ${live ? "bg-emerald-300" : "bg-amber-300"}`} />
      <div>
        <p className={`text-sm font-semibold ${live ? "text-emerald-100" : "text-amber-100"}`}>{live ? "LIVE" : status}</p>
        <p className="text-xs leading-5 text-slate-300">{message}</p>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, helper }: { icon: ReactNode; label: string; value: ReactNode; helper: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
        <span className="text-slate-400">{icon}</span>
      </div>
      <div className="mt-3 min-h-8 text-2xl font-semibold text-white">{value}</div>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </div>
  );
}

function SetupMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-black/25 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-slate-200">{value}</p>
    </div>
  );
}

function ExecutionBlock({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-[#0b1017]/90 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <span className="text-slate-400">{icon}</span>
      </div>
      <div className="mt-4 space-y-2">{children}</div>
    </section>
  );
}

function BlockRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-black/25 px-3 py-2">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="font-mono text-sm text-white">{value}</span>
    </div>
  );
}

function formatPrice(value?: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value.toFixed(2) : "--";
}
