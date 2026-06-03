import { Activity, AlertTriangle, CircleDollarSign, Gauge, LineChart, Target } from "lucide-react";
import type { Candle, MacroContext, NewsEvent, Timeframe, TimeframeAnalysis, TradePlan } from "@/types";
import { GoldChart } from "@/components/chart/gold-chart";
import { JournalPanel } from "@/components/journal/journal-panel";
import { MetricCard } from "@/components/dashboard/metric-card";
import { NewsPanel } from "@/components/news/news-panel";
import { RiskPanel } from "@/components/risk-management/risk-panel";
import { ScoreBar } from "@/components/ui/score-bar";
import { SignalBadge } from "@/components/ui/signal-badge";
import { TimeframeGrid } from "@/components/timeframe-cards/timeframe-grid";
import { TradeChecklist } from "@/components/dashboard/trade-checklist";

export function MainDashboard({
  candleMap,
  macro,
  news,
  plan,
  timeframeAnalyses,
}: {
  candleMap: Record<Timeframe, Candle[]>;
  macro: MacroContext;
  news: NewsEvent[];
  plan: TradePlan;
  timeframeAnalyses: TimeframeAnalysis[];
}) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[1560px] px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-white/10 pb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-amber-200">TradeTSR Analysis Assistant</p>
          <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">GOLD / XAUUSD</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Cette application est un outil d'aide à l'analyse. Elle ne garantit aucun résultat. Le trading comporte des risques importants.
            Utilisez toujours une bonne gestion du risque.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-amber-300/20 bg-amber-300/10 px-4 py-3">
          <AlertTriangle size={20} className="text-amber-200" />
          <div>
            <p className="text-sm font-semibold text-amber-100">Probabilités, pas certitudes</p>
            <p className="text-xs text-amber-100/70">Confluence, confirmation, risque.</p>
          </div>
        </div>
      </header>

      <section className="grid gap-3 py-5 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Prix actuel" value={`$${plan.entry.toFixed(2)}`} helper="Mock XAUUSD prêt à remplacer par API prix." icon={<CircleDollarSign size={18} />} />
        <MetricCard label="Direction probable" value={plan.direction} helper="Biais issu de la confluence H1." icon={<LineChart size={18} />} />
        <MetricCard
          label="Décision finale"
          value={<SignalBadge signal={plan.decision} />}
          helper="BUY/SELL seulement avec confirmations suffisantes."
          icon={<Target size={18} />}
        />
        <MetricCard label="Risk/Reward" value={`1:${plan.riskReward.toFixed(2)}`} helper="Minimum recommandé : 1:2." icon={<Gauge size={18} />} />
        <MetricCard label="Lot recommandé" value={plan.lotSize.toFixed(2)} helper="Capital mock : 10 000 $, risque 1 %." icon={<Activity size={18} />} />
        <div className="rounded-lg border border-white/10 bg-slate-950/55 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Score global</p>
          <div className="mt-3 text-2xl font-semibold text-white">{plan.score}/100</div>
          <div className="mt-3">
            <ScoreBar value={plan.score} compact />
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <GoldChart candleMap={candleMap} plan={plan} />
          <TimeframeGrid analyses={timeframeAnalyses} />
        </div>
        <aside className="space-y-5">
          <section className="rounded-lg border border-white/10 bg-slate-950/55 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Plan potentiel</h2>
              <SignalBadge signal={plan.decision} />
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-400">{plan.summary}</p>
            <div className="mt-4 grid gap-2">
              <PlanRow label="Entry" value={plan.entry} />
              <PlanRow label="Stop loss" value={plan.stopLoss} />
              <PlanRow label="TP1" value={plan.takeProfits[0]} />
              <PlanRow label="TP2" value={plan.takeProfits[1]} />
              <PlanRow label="TP3" value={plan.takeProfits[2]} />
            </div>
          </section>

          <section className="rounded-lg border border-white/10 bg-slate-950/55 p-5">
            <h2 className="text-lg font-semibold text-white">Alertes</h2>
            <div className="mt-4 space-y-2">
              {plan.alerts.map((alert) => (
                <div key={alert} className="rounded-md bg-slate-900/75 px-3 py-2 text-sm leading-5 text-slate-300">
                  {alert}
                </div>
              ))}
            </div>
          </section>

          <NewsPanel macro={macro} news={news} />
        </aside>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <RiskPanel plan={plan} />
        <TradeChecklist />
      </section>

      <section className="mt-5">
        <JournalPanel />
      </section>
    </main>
  );
}

function PlanRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-slate-900/75 px-3 py-2">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="font-mono text-sm text-white">{value.toFixed(2)}</span>
    </div>
  );
}
