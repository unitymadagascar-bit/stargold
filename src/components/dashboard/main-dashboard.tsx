"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Activity, AlertTriangle, Clock, Gauge, LineChart, Radio, ShieldCheck, Target, Zap } from "lucide-react";
import type { LiquidityAnalysis, OrderBlockZone, SignalMode, Timeframe, TimeframeAnalysis, TradePlan } from "@/types";
import { GoldChart } from "@/components/chart/gold-chart";
import { FundamentalPanel } from "@/components/fundamentals/fundamental-panel";
import { RiskPanel } from "@/components/risk-management/risk-panel";
import { ScoreDetail } from "@/components/dashboard/score-detail";
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
  const [signalMode, setSignalMode] = useState<SignalMode>("conservative");
  const timeframeAnalyses = useMemo(
    () => buildLiveTimeframeAnalyses({ candleMap: live.candleMap, fundamental: fundamentals.fundamental, macro: macroContext, mode: signalMode, news: newsEvents }),
    [fundamentals.fundamental, live.candleMap, signalMode],
  );
  const plan = useMemo(
    () => buildLiveTradePlan({ candleMap: live.candleMap, fundamental: fundamentals.fundamental, macro: macroContext, mode: signalMode, news: newsEvents, preferredTimeframe: activeTimeframe }),
    [activeTimeframe, fundamentals.fundamental, live.candleMap, signalMode],
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

      <section className="mt-3 rounded-lg border border-white/10 bg-[#0b1017]/90 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-md border border-white/10 bg-black/25 p-1">
            <ModeButton active={signalMode === "conservative"} label="Conservative" onClick={() => setSignalMode("conservative")} />
            <ModeButton active={signalMode === "scalping"} label="Scalping" onClick={() => setSignalMode("scalping")} />
          </div>
          <p className="text-xs leading-5 text-slate-400">
            {signalMode === "scalping"
              ? "Scalping has higher risk and requires strict stop loss."
              : "Conservative mode requires stronger confirmation and accepts more WAIT signals."}
          </p>
        </div>
      </section>

      <section className="mt-3">
        <TimeframeGrid analyses={timeframeAnalyses} />
      </section>

      <section className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_390px]">
        <GoldChart
          candleMap={live.candleMap}
          connectionMessage={live.message}
          connectionStatus={live.status}
          orderBlock={activeAnalysis?.orderBlock ?? plan.orderBlock}
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
            <SignalModePanel activeAnalysis={activeAnalysis} mode={signalMode} onModeChange={setSignalMode} plan={plan} />
            <p className="mt-3 text-sm leading-6 text-slate-300">{plan.summary}</p>
            <div className="mt-3 rounded-md border border-sky-300/20 bg-sky-300/10 p-3">
              <p className="text-sm font-semibold text-sky-100">{activeAnalysis?.waitReason ?? plan.waitReason}</p>
              <p className="mt-1 text-xs leading-5 text-slate-300">
                {activeAnalysis?.missingConditions.length
                  ? `Missing before signal: ${activeAnalysis.missingConditions.join(", ")}`
                  : "All required conditions are currently satisfied for this mode."}
              </p>
            </div>
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
              <SetupMetric label="Price Action" value={`${plan.scoring.priceAction ?? plan.scoring.technical}/30`} />
              <SetupMetric label="Structure" value={`${plan.scoring.marketStructure ?? plan.scoring.orderFlow}/20`} />
              <SetupMetric label="Liquidite" value={`${plan.scoring.liquidity ?? 0}/20`} />
              <SetupMetric label="DXY" value={`${plan.scoring.dxy ?? 0}/10`} />
              <SetupMetric label="News USD" value={`${plan.scoring.news ?? 0}/10`} />
              <SetupMetric label="Risque" value={`${plan.scoring.volatilityRisk ?? plan.scoring.risk}/10`} />
              <SetupMetric label="Total" value={`${plan.score}/100`} />
            </div>
          </section>

          <ScoreDetail
            activeAnalysis={activeAnalysis}
            analyses={timeframeAnalyses}
            fundamental={fundamentals.fundamental}
            plan={plan}
            price={latestPrice}
            spread={spread}
          />

          <LiquidityPanel liquidity={activeAnalysis?.liquidity ?? plan.liquidity} />

          <OrderBlockPanel orderBlock={activeAnalysis?.orderBlock ?? plan.orderBlock} />

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

function ModeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={`h-9 rounded px-3 text-sm font-semibold transition ${
        active ? "bg-amber-300/15 text-amber-100" : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
      }`}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function SignalModePanel({
  activeAnalysis,
  mode,
  onModeChange,
  plan,
}: {
  activeAnalysis?: TimeframeAnalysis;
  mode: SignalMode;
  onModeChange: (mode: SignalMode) => void;
  plan: TradePlan;
}) {
  const scalpReady = plan.decision === "BUY SCALP" || plan.decision === "SELL SCALP";
  const missing = activeAnalysis?.missingConditions ?? plan.missingConditions;

  return (
    <section className="mt-4 rounded-md border border-amber-300/20 bg-amber-300/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-amber-100">
          <Zap size={17} />
          <p className="text-sm font-semibold">Signal mode</p>
        </div>
        <div className="inline-flex rounded-md border border-white/10 bg-black/25 p-1">
          <ModeButton active={mode === "conservative"} label="Conservative" onClick={() => onModeChange("conservative")} />
          <ModeButton active={mode === "scalping"} label="Scalping" onClick={() => onModeChange("scalping")} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <SetupMetric label="Mode actif" value={mode === "scalping" ? "Scalping" : "Conservative"} />
        <SetupMetric label="Scalp status" value={scalpReady ? plan.decision : "WAIT"} />
        <SetupMetric label="Seuil scalp" value="60/100" />
        <SetupMetric label="Timeframes" value="M1 / M5 / M15" />
      </div>

      <p className="mt-3 text-xs leading-5 text-amber-100">
        Scalping has higher risk and requires strict stop loss.
      </p>
      <p className="mt-2 rounded border border-white/10 bg-black/25 px-3 py-2 text-xs leading-5 text-slate-300">
        {mode === "scalping"
          ? missing.length
            ? `Avant BUY/SELL SCALP: ${missing.join(", ")}`
            : "Conditions scalp pretes."
          : "Passe en Scalping pour activer les alertes BUY SCALP / SELL SCALP sur M1, M5 et M15."}
      </p>
    </section>
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

function LiquidityPanel({ liquidity }: { liquidity: LiquidityAnalysis | null | undefined }) {
  if (!liquidity) {
    return (
      <section className="rounded-lg border border-white/10 bg-[#0b1017]/90 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white">Analyse de Liquidite XAUUSD</h2>
          <span className="rounded border border-slate-400/20 bg-slate-400/10 px-2 py-1 font-mono text-xs text-slate-300">WAIT</span>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-400">En attente de suffisamment de bougies live pour cartographier la liquidite.</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <SetupMetric label="Zone detectee" value="--" />
          <SetupMetric label="Type" value="none" />
          <SetupMetric label="Sweep detecte" value="non" />
          <SetupMetric label="Rejet confirme" value="non" />
          <SetupMetric label="Direction probable" value="Attendre" />
          <SetupMetric label="Confiance" value="0/100" />
        </div>
      </section>
    );
  }

  const directional =
    liquidity.probableDirection === "BUY"
      ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
      : liquidity.probableDirection === "SELL"
        ? "border-red-300/20 bg-red-300/10 text-red-100"
        : "border-sky-300/20 bg-sky-300/10 text-sky-100";
  const caution = liquidity.sweepDetected && !liquidity.rejectionConfirmed && !liquidity.realBreakoutContinuation;

  return (
    <section className="rounded-lg border border-white/10 bg-[#0b1017]/90 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Analyse de Liquidite XAUUSD</h2>
          <p className="mt-1 text-xs text-slate-500">Session {liquidity.activeSession} · risque {liquidity.riskLevel}</p>
        </div>
        <span className={`rounded border px-2 py-1 font-mono text-xs font-semibold ${directional}`}>{liquidity.confidence}/100</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <SetupMetric label="Zone detectee" value={liquidity.zone ? `${liquidity.zone.price.toFixed(2)} (${liquidity.zone.strength}/5)` : "--"} />
        <SetupMetric label="Type" value={liquidity.type} />
        <SetupMetric label="Sweep detecte" value={liquidity.sweepDetected ? "oui" : "non"} />
        <SetupMetric label="Rejet confirme" value={liquidity.rejectionConfirmed ? "oui" : "non"} />
        <SetupMetric label="Direction probable" value={liquidity.probableDirection} />
        <SetupMetric label="Confiance" value={`${liquidity.confidence}/100`} />
        <SetupMetric label="Equal highs/lows" value={`${liquidity.equalHighs.length}/${liquidity.equalLows.length}`} />
        <SetupMetric label="Stop hunt" value={liquidity.stopHunt ? "oui" : "non"} />
        <SetupMetric label="Cassure reelle" value={liquidity.realBreakoutContinuation ? "oui" : "non"} />
      </div>

      <p className={`mt-4 rounded-md border p-3 text-xs leading-5 ${caution ? "border-amber-300/25 bg-amber-300/10 text-amber-100" : "border-white/10 bg-black/25 text-slate-300"}`}>
        {caution ? "Prudence: liquidite prise sans confirmation. Attendre bougie de rejet, changement de structure ou retest." : liquidity.cautionMessage}
      </p>

      <div className="mt-3 space-y-1.5">
        {liquidity.reasons.slice(0, 5).map((reason) => (
          <p key={reason} className="rounded-md bg-black/25 px-3 py-2 text-xs leading-5 text-slate-300">
            {reason}
          </p>
        ))}
      </div>
    </section>
  );
}

function OrderBlockPanel({ orderBlock }: { orderBlock: OrderBlockZone | null | undefined }) {
  if (!orderBlock) {
    return (
      <section className="rounded-lg border border-white/10 bg-[#0b1017]/90 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white">Order Block</h2>
          <span className="rounded border border-slate-400/20 bg-slate-400/10 px-2 py-1 font-mono text-xs text-slate-300">WAIT</span>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-400">Aucune zone Order Block qualifiee au-dessus de 60/100 sur cette timeframe.</p>
        <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">
          Order Block is an analysis zone, not a guaranteed entry.
        </p>
      </section>
    );
  }

  const bullish = orderBlock.direction === "bullish";
  const accent = bullish ? "text-emerald-200" : "text-red-200";
  const border = bullish ? "border-emerald-300/20" : "border-red-300/20";
  const bg = bullish ? "bg-emerald-300/10" : "bg-red-300/10";

  return (
    <section className={`rounded-lg border ${border} bg-[#0b1017]/90 p-4`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Order Block</h2>
          <p className={`mt-1 text-xs font-semibold uppercase tracking-[0.14em] ${accent}`}>
            {bullish ? "Bullish" : "Bearish"} · {orderBlock.strength}
          </p>
        </div>
        <span className={`rounded border px-2 py-1 font-mono text-xs font-semibold ${border} ${bg} ${accent}`}>{orderBlock.score}/100</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <SetupMetric label="Zone" value={`${orderBlock.low.toFixed(2)} - ${orderBlock.high.toFixed(2)}`} />
        <SetupMetric label="Freshness" value={orderBlock.fresh ? "fraiche" : `${orderBlock.retestCount} retest(s)`} />
        <SetupMetric label="BOS" value={orderBlock.bosConfirmed ? "confirme" : "absent"} />
        <SetupMetric label="Displacement" value={orderBlock.displacementConfirmed ? "fort" : "faible"} />
        <SetupMetric label="Liquidity sweep" value={orderBlock.liquiditySweep ? "confirme" : "absent"} />
        <SetupMetric label="FVG" value={orderBlock.fvg ? `${orderBlock.fvg.low.toFixed(2)} - ${orderBlock.fvg.high.toFixed(2)}` : "absent"} />
        <SetupMetric label="Risk/Reward" value={orderBlock.riskReward ? `1:${orderBlock.riskReward.toFixed(2)}` : "--"} />
        <SetupMetric label="ATR quality" value={orderBlock.atrQuality} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <ScoreMini label="BOS" score={orderBlock.scoreBreakdown.bos} max={25} />
        <ScoreMini label="Displacement" score={orderBlock.scoreBreakdown.displacement} max={20} />
        <ScoreMini label="H1/H4" score={orderBlock.scoreBreakdown.trendAlignment} max={15} />
        <ScoreMini label="Sweep" score={orderBlock.scoreBreakdown.liquiditySweep} max={10} />
        <ScoreMini label="Freshness" score={orderBlock.scoreBreakdown.freshness} max={10} />
        <ScoreMini label="FVG" score={orderBlock.scoreBreakdown.fvg} max={10} />
        <ScoreMini label="RR" score={orderBlock.scoreBreakdown.riskReward} max={5} />
        <ScoreMini label="ATR" score={orderBlock.scoreBreakdown.volatility} max={5} />
      </div>

      <div className="mt-4 space-y-1.5">
        {orderBlock.reasons.slice(0, 5).map((reason) => (
          <p key={reason} className="rounded-md bg-black/25 px-3 py-2 text-xs leading-5 text-slate-300">
            {reason}
          </p>
        ))}
      </div>

      <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">
        Order Block is an analysis zone, not a guaranteed entry.
      </p>
    </section>
  );
}

function ScoreMini({ label, score, max }: { label: string; score: number; max: number }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-black/25 px-3 py-2">
      <span className="text-slate-400">{label}</span>
      <span className={score === max ? "font-mono font-semibold text-emerald-300" : score > 0 ? "font-mono font-semibold text-amber-300" : "font-mono text-slate-500"}>
        {score}/{max}
      </span>
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
