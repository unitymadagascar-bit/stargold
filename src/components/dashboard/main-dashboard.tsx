"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Activity, Bell, BellRing, Clock, Gauge, ShieldCheck, Target, Volume2, Wifi, WifiOff, Zap } from "lucide-react";
import type { FundamentalContext, LiquidityAnalysis, LiveMarketState, MovingAverageType, OrbDuration, OrderBlockZone, ScalpingSensitivity, Signal, SignalMode, Timeframe, TimeframeAnalysis, TradePlan } from "@/types";
import { GoldChart } from "@/components/chart/gold-chart";
import { FundamentalPanel } from "@/components/fundamentals/fundamental-panel";
import { FinalTradingDecision } from "@/components/dashboard/final-trading-decision";
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

const alertCooldownOptions = [
  { label: "30 sec", value: 30_000 },
  { label: "1 min", value: 60_000 },
  { label: "3 min", value: 180_000 },
  { label: "5 min", value: 300_000 },
];

const defaultAlertSettings: AlertSettings = {
  alertOnWatch: false,
  browserEnabled: false,
  cooldownMs: 60_000,
  soundEnabled: false,
};

export function MainDashboard() {
  const live = useLiveXauusd();
  const fundamentals = useFundamentalContext();
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>("M15");
  const [signalMode, setSignalMode] = useState<SignalMode>("conservative");
  const [scalpingSensitivity, setScalpingSensitivity] = useState<ScalpingSensitivity>("balanced");
  const [orbDuration, setOrbDuration] = useState<OrbDuration>(30);
  const [orbRequireRetest, setOrbRequireRetest] = useState(false);
  const [movingAverageType, setMovingAverageType] = useState<MovingAverageType>("EMA");
  const [movingAveragePeriod, setMovingAveragePeriod] = useState(50);
  const [alertSettings, setAlertSettings] = useState<AlertSettings>(() => loadAlertSettings());
  const [alertHistory, setAlertHistory] = useState<AlertHistoryItem[]>(() => loadAlertHistory());
  const [notificationStatus, setNotificationStatus] = useState(() => getNotificationStatus());
  const lastAlertRef = useRef<{ id: string; time: number }>({ id: "", time: 0 });
  const spread = live.lastTick?.bid !== undefined && live.lastTick.ask !== undefined ? Math.abs(live.lastTick.ask - live.lastTick.bid) : null;
  const timeframeAnalyses = useMemo(
    () => buildLiveTimeframeAnalyses({ candleMap: live.candleMap, fundamental: fundamentals.fundamental, macro: macroContext, mode: signalMode, movingAveragePeriod, movingAverageType, news: newsEvents, orbDuration, orbRequireRetest, scalpingSensitivity, spread }),
    [fundamentals.fundamental, live.candleMap, movingAveragePeriod, movingAverageType, orbDuration, orbRequireRetest, scalpingSensitivity, signalMode, spread],
  );
  const plan = useMemo(
    () => buildLiveTradePlan({ candleMap: live.candleMap, fundamental: fundamentals.fundamental, macro: macroContext, mode: signalMode, movingAveragePeriod, movingAverageType, news: newsEvents, orbDuration, orbRequireRetest, preferredTimeframe: activeTimeframe, scalpingSensitivity, spread }),
    [activeTimeframe, fundamentals.fundamental, live.candleMap, movingAveragePeriod, movingAverageType, orbDuration, orbRequireRetest, scalpingSensitivity, signalMode, spread],
  );
  const latestPrice = getLatestPrice(live.candleMap);
  const activeCandles = live.candleMap[activeTimeframe];
  const activeAnalysis = timeframeAnalyses.find((item) => item.timeframe === activeTimeframe);
  const latestCandle = activeCandles.at(-1) ?? null;
  const previousCandle = activeCandles.at(-2) ?? null;
  const priceChange = latestCandle && previousCandle ? latestCandle.close - previousCandle.close : 0;
  const priceChangePercent = previousCandle?.close ? (priceChange / previousCandle.close) * 100 : 0;
  const handleSignalModeChange = (mode: SignalMode) => {
    setSignalMode(mode);
    if (mode === "scalping" && activeTimeframe !== "M1" && activeTimeframe !== "M5") {
      setActiveTimeframe("M5");
    }
  };

  useEffect(() => {
    window.localStorage.setItem("tradetsr-alert-settings", JSON.stringify(alertSettings));
  }, [alertSettings]);

  useEffect(() => {
    window.localStorage.setItem("tradetsr-alert-history", JSON.stringify(alertHistory.slice(0, 20)));
  }, [alertHistory]);

  useEffect(() => {
    const candidate = getTradingAlertCandidate({ alertOnWatch: alertSettings.alertOnWatch, plan, price: latestPrice });

    if (!candidate || (!alertSettings.soundEnabled && !alertSettings.browserEnabled)) {
      return;
    }

    const now = Date.now();
    const previous = lastAlertRef.current;
    const sameSetupCoolingDown = previous.id === candidate.id && now - previous.time < alertSettings.cooldownMs;

    if (sameSetupCoolingDown) {
      return;
    }

    lastAlertRef.current = { id: candidate.id, time: now };

    if (alertSettings.soundEnabled) {
      playAlertSound();
    }

    if (alertSettings.browserEnabled) {
      showBrowserNotification(candidate, setNotificationStatus);
    }

    setAlertHistory((history) => [candidate.historyItem, ...history].slice(0, 20));
  }, [
    alertSettings.alertOnWatch,
    alertSettings.browserEnabled,
    alertSettings.cooldownMs,
    alertSettings.soundEnabled,
    latestPrice,
    plan.decision,
    plan.direction,
    plan.entry,
    plan.score,
    plan.stopLoss,
    plan.takeProfits,
    plan.waitReason,
  ]);

  async function requestNotificationPermission() {
    if (!("Notification" in window)) {
      setNotificationStatus("Browser notifications are not supported in this browser.");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationStatus(
      permission === "granted"
        ? "Browser notifications enabled."
        : permission === "denied"
          ? "Notifications are blocked. Enable them in your browser site settings for tradetsr.vercel.app."
          : "Notification permission was not granted yet.",
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1340px] px-3 py-3 sm:px-4 lg:px-5">
      <BrandHeader />
      <Mt5ConnectionHeader live={live} spread={spread} />

      <section className="grid gap-3 xl:grid-cols-[minmax(0,2.05fr)_minmax(340px,1fr)]">
        <MarketSummary
          activeAnalysis={activeAnalysis}
          latestCandle={latestCandle}
          plan={plan}
          price={latestPrice}
          priceChange={priceChange}
          priceChangePercent={priceChangePercent}
        />
        <MacroPanel fundamental={fundamentals.fundamental} liveMessage={live.message} plan={plan} spread={spread} />
      </section>

      <FinalTradingDecision activeAnalysis={activeAnalysis} activeTimeframe={activeTimeframe} fundamental={fundamentals.fundamental} plan={plan} />

      <section className="mt-3">
        <TimeframeGrid activeTimeframe={activeTimeframe} analyses={timeframeAnalyses} onTimeframeChange={setActiveTimeframe} />
      </section>

      <Disclaimer />

      <section className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          <GoldChart
            candleMap={live.candleMap}
            connectionMessage={live.message}
            connectionStatus={live.status}
            lastTick={live.lastTick}
            orderBlock={activeAnalysis?.orderBlock ?? plan.orderBlock}
            fvg={activeAnalysis?.fvg ?? plan.fvg}
            orb={activeAnalysis?.orb ?? plan.orb}
            plan={plan}
            timeframe={activeTimeframe}
            onTimeframeChange={setActiveTimeframe}
          />

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ExecutionBlock title="Zones cles" icon={<Activity size={18} />}>
              <BlockRow label="Support proche" value={formatPrice(activeAnalysis?.support)} />
              <BlockRow label="Resistance proche" value={formatPrice(activeAnalysis?.resistance)} />
              <BlockRow label="Volatilite" value={activeAnalysis?.volatility ?? "attente"} />
            </ExecutionBlock>

            <ExecutionBlock title="Entree / SL" icon={<ShieldCheck size={18} />}>
              <BlockRow label="Entry" value={formatPrice(plan.entry)} />
              <BlockRow label="Stop loss" value={formatPrice(plan.stopLoss)} />
              <BlockRow label="Decision" value={plan.decision} />
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
        </div>

        <aside className="space-y-3">
          <SignalModePanel
            activeAnalysis={activeAnalysis}
            mode={signalMode}
            movingAveragePeriod={movingAveragePeriod}
            movingAverageType={movingAverageType}
            onModeChange={handleSignalModeChange}
            onMovingAveragePeriodChange={setMovingAveragePeriod}
            onMovingAverageTypeChange={setMovingAverageType}
            onOrbDurationChange={setOrbDuration}
            onOrbRequireRetestChange={setOrbRequireRetest}
            onSensitivityChange={setScalpingSensitivity}
            orbDuration={orbDuration}
            orbRequireRetest={orbRequireRetest}
            plan={plan}
            sensitivity={scalpingSensitivity}
          />
          <TradingAlertsPanel
            history={alertHistory}
            notificationStatus={notificationStatus}
            onRequestPermission={requestNotificationPermission}
            onSettingsChange={setAlertSettings}
            onTestSound={playAlertSound}
            settings={alertSettings}
          />
          <SetupPanel activeAnalysis={activeAnalysis} activeTimeframe={activeTimeframe} candleCount={activeCandles.length} plan={plan} />
          <TradeChecklist />
          <ScoreDetail activeAnalysis={activeAnalysis} analyses={timeframeAnalyses} fundamental={fundamentals.fundamental} plan={plan} price={latestPrice} spread={spread} />
          <LiquidityPanel liquidity={activeAnalysis?.liquidity ?? plan.liquidity} />
          <OrderBlockPanel orderBlock={activeAnalysis?.orderBlock ?? plan.orderBlock} />
          <FundamentalPanel
            apiError={fundamentals.apiError}
            fundamental={fundamentals.fundamental}
            manualEvents={fundamentals.manualEvents}
            onAddManualEvent={fundamentals.addManualEvent}
            onImportManualEvents={fundamentals.importManualEvents}
            onRemoveManualEvent={fundamentals.removeManualEvent}
            onUpdateDxy={fundamentals.updateDxy}
          />
          <RiskPanel plan={plan} />
        </aside>
      </section>
    </main>
  );
}

function BrandHeader() {
  return (
    <header className="mb-3 rounded-md border border-amber-300/20 bg-[#11100c] px-4 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.24)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <img className="size-14 shrink-0 rounded-md border border-amber-300/25 bg-black object-cover" src="/star-gold-icon.png" alt="Star Gold By TSR" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/80">Gold Trading Assistant For MT5</p>
            <h1 className="mt-1 text-2xl font-black tracking-normal text-white">Star Gold By TSR</h1>
            <p className="mt-1 text-xs text-slate-400">XAUUSD live analysis, scalping decisions, risk control.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md border border-amber-300/25 bg-amber-300/10 px-3 py-2 font-mono font-bold text-amber-100">XAUUSD</span>
          <span className="rounded-md border border-white/10 bg-black/25 px-3 py-2 font-semibold text-slate-300">MT5 Bridge Ready</span>
        </div>
      </div>
    </header>
  );
}

function Mt5ConnectionHeader({ live, spread }: { live: LiveMarketState; spread: number | null }) {
  const source = live.source ?? "unknown";
  const mt5Connected = live.status === "live" && source.toUpperCase() === "MT5";
  const liveFallback = live.status === "live" && !mt5Connected;
  const statusLabel = mt5Connected ? "MT5 connecte" : liveFallback ? "MT5 non connecte - fallback actif" : "MT5 non connecte";
  const statusClass = mt5Connected
    ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
    : liveFallback
      ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
      : "border-rose-300/25 bg-rose-300/10 text-rose-100";

  return (
    <section className={`mb-3 rounded-md border px-4 py-3 ${statusClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-black/25 text-white">{mt5Connected ? <Wifi size={18} /> : <WifiOff size={18} />}</span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-75">Connexion application / MT5</p>
            <h1 className="mt-0.5 text-lg font-black text-white">{statusLabel}</h1>
            <p className="mt-1 truncate text-xs text-slate-300">{live.message}</p>
          </div>
        </div>

        <div className="grid w-full gap-2 text-xs sm:w-auto sm:grid-cols-5">
          <HeaderMetric label="Source active" value={source} />
          <HeaderMetric label="Dernier prix" value={live.lastTick?.price ? live.lastTick.price.toFixed(2) : "--"} />
          <HeaderMetric label="Dernier tick" value={formatTickTime(live.lastTick?.time)} />
          <HeaderMetric label="Latence" value={live.latencyMs === null ? "--" : `${Math.round(live.latencyMs)}ms`} />
          <HeaderMetric label="Spread" value={spread === null ? "--" : spread.toFixed(2)} />
        </div>
      </div>
    </section>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70">{label}</p>
      <p className="mt-1 font-mono text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function MarketSummary({
  activeAnalysis,
  latestCandle,
  plan,
  price,
  priceChange,
  priceChangePercent,
}: {
  activeAnalysis?: TimeframeAnalysis;
  latestCandle: { open: number; high: number; low: number; close: number } | null;
  plan: TradePlan;
  price: number;
  priceChange: number;
  priceChangePercent: number;
}) {
  const bearish = plan.decision !== "WAIT" && (plan.direction === "Bearish" || plan.decision === "WATCH SELL" || plan.decision === "SELL SCALP READY" || plan.decision === "STRONG SELL");
  const bullish = plan.decision !== "WAIT" && (plan.direction === "Bullish" || plan.decision === "WATCH BUY" || plan.decision === "BUY SCALP READY" || plan.decision === "STRONG BUY");
  const scoreColor = bullish ? "#22c55e" : bearish ? "#ff333d" : "#f59e0b";

  return (
    <section className="rounded-md border border-white/10 bg-[#171717] p-4 shadow-[0_20px_55px_rgba(0,0,0,0.22)]">
      <div className="grid min-h-[188px] gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
            <span>XAUUSD - Gold Spot</span>
            <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-400">SPOT</span>
          </div>
          <div className={`mt-2 font-mono text-4xl font-bold tracking-tight ${bearish ? "text-[#ff333d]" : bullish ? "text-emerald-300" : "text-amber-200"}`}>
            {price ? price.toFixed(2) : "--"}
          </div>
          <div className={`mt-1 font-mono text-xs font-semibold ${priceChange < 0 ? "text-[#ff333d]" : priceChange > 0 ? "text-emerald-300" : "text-slate-500"}`}>
            {priceChange ? `${priceChange > 0 ? "+" : ""}${priceChange.toFixed(2)} (${priceChangePercent.toFixed(2)}%)` : "--"}
          </div>
          <div className="mt-1 flex flex-wrap gap-3 font-mono text-xs text-slate-400">
            <span>O {formatPrice(latestCandle?.open)}</span>
            <span>H {formatPrice(latestCandle?.high)}</span>
            <span>L {formatPrice(latestCandle?.low)}</span>
            <span>C {formatPrice(latestCandle?.close)}</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">Source: MT5 cloud bridge, fallback marche si MT5 demarre plus lentement</p>
        </div>

        <div className="flex items-center gap-4 border-l border-white/10 pl-5">
          <div
            className="grid size-[88px] place-items-center rounded-full"
            style={{ background: `conic-gradient(${scoreColor} ${Math.max(0, Math.min(plan.score, 100)) * 3.6}deg, rgba(255,255,255,0.08) 0deg)` }}
          >
            <div className="grid size-[72px] place-items-center rounded-full bg-[#171717]">
              <div className="text-center">
                <p className="font-mono text-2xl font-bold text-white">{plan.score}</p>
                <p className="font-mono text-[10px] text-slate-500">/100</p>
              </div>
            </div>
          </div>
          <div>
            <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${bearish ? "text-[#ff333d]" : bullish ? "text-emerald-300" : "text-amber-200"}`}>
              {plan.score >= 75 ? "Signal fort" : plan.score >= 60 ? "Signal moyen" : "Signal faible"}
            </p>
            <p className="mt-1 text-xl font-black uppercase text-white">{plan.decision === "WAIT" ? "Neutral" : plan.direction}</p>
            <p className="mt-1 max-w-44 text-xs leading-5 text-slate-500">Probabilite, pas une garantie.</p>
            <div className="mt-3">
              <SignalBadge signal={plan.decision} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MacroPanel({ fundamental, liveMessage, plan, spread }: { fundamental: FundamentalContext; liveMessage: string; plan: TradePlan; spread: number | null }) {
  return (
    <section className="rounded-md border border-white/10 bg-[#171717] p-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Contexte Macro</h2>
      <div className="mt-4 space-y-3">
        <MacroRow label="DXY" value={fundamental.dxy.value ? fundamental.dxy.value.toFixed(2) : "--"} helper={formatDxyDirection(fundamental.dxy.direction)} positive={fundamental.dxy.direction === "falling"} />
        <MacroRow label="US10Y" value={macroContext.us10yDirection} helper="impact inverse gold" positive={macroContext.us10yDirection === "Bearish"} />
        <div className="border-t border-white/10 pt-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Coherence Gold / DXY / US10Y</p>
          <span className="mt-2 inline-flex rounded border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-xs font-semibold text-emerald-200">Coherent</span>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Session</p>
            <p className="mt-1 text-sm font-semibold text-white">{plan.liquidity?.activeSession ?? "Off session"}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Volatilite</p>
            <p className={`mt-1 text-sm font-semibold uppercase ${fundamental.riskLevel === "eleve" ? "text-[#ff333d]" : "text-amber-200"}`}>{fundamental.riskLevel}</p>
          </div>
        </div>
        <div className="border-t border-white/10 pt-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">News high-impact</p>
          <p className="mt-1 text-xs leading-5 text-slate-300">{fundamental.cautionMessage ?? "Aucune news high-impact imminente."}</p>
        </div>
        <div className="border-t border-white/10 pt-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Flux</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">{liveMessage}</p>
          <p className="mt-1 font-mono text-xs text-slate-500">Spread {spread === null ? "--" : spread.toFixed(2)}</p>
        </div>
      </div>
    </section>
  );
}

function MacroRow({ helper, label, positive, value }: { helper: string; label: string; positive: boolean; value: string }) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-3">
      <div>
        <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
        <p className="mt-1 font-mono text-xl font-bold text-white">{value}</p>
      </div>
      <div className="text-right">
        <p className={`font-mono text-xs font-bold ${positive ? "text-emerald-300" : "text-[#ff333d]"}`}>{positive ? "+ supportive" : "- pressure"}</p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-slate-500">{helper}</p>
      </div>
    </div>
  );
}

function Disclaimer() {
  return (
    <section className="mt-3 rounded-md border border-white/10 bg-[#121212] px-4 py-3">
      <p className="text-xs leading-5 text-slate-400">
        <span className="font-semibold text-white">Disclaimer.</span> Cette application est un outil d'aide a l'analyse. Elle ne garantit aucun resultat. Le trading comporte des risques importants. Les signaux doivent etre utilises avec une bonne gestion du risque.
      </p>
    </section>
  );
}

function SetupPanel({ activeAnalysis, activeTimeframe, candleCount, plan }: { activeAnalysis?: TimeframeAnalysis; activeTimeframe: Timeframe; candleCount: number; plan: TradePlan }) {
  return (
    <section className="rounded-md border border-white/10 bg-[#171717] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Details Setup</h2>
          <p className="mt-1 text-xs text-slate-500">{activeTimeframe} - {candleCount} bougies live</p>
        </div>
        <SignalBadge signal={activeAnalysis?.signal ?? "WAIT"} />
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-300">{plan.summary}</p>
      <div className="mt-3 rounded-md border border-sky-300/20 bg-sky-300/10 p-2.5">
        <p className="text-sm font-semibold text-sky-100">{activeAnalysis?.waitReason ?? plan.waitReason}</p>
        <p className="mt-1 text-xs leading-5 text-slate-300">
          {activeAnalysis?.missingConditions.length ? `Missing before signal: ${activeAnalysis.missingConditions.join(", ")}` : "All required conditions are currently satisfied for this mode."}
        </p>
      </div>
      <div className="mt-3">
        <ScoreBar value={activeAnalysis?.score ?? 0} compact />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <SetupMetric label="Trend" value={activeAnalysis?.trend ?? "range"} />
        <SetupMetric label="Structure" value={activeAnalysis?.structure ?? "range"} />
        <SetupMetric label="RSI" value={(activeAnalysis?.rsi ?? 50).toFixed(1)} />
        <SetupMetric label="ATR" value={(activeAnalysis?.atr ?? 0).toFixed(2)} />
        <SetupMetric label="Sweep" value={activeAnalysis?.liquiditySweep ? "confirme" : "attente"} />
        <SetupMetric label="Retest" value={activeAnalysis?.retestConfirmed ? "confirme" : "attente"} />
        <SetupMetric label="ORB" value={activeAnalysis?.orb?.status ?? plan.orb?.status ?? "WAIT"} />
        <SetupMetric label="FVG" value={activeAnalysis?.fvg ? `${activeAnalysis.fvg.fillPercent}% fill` : plan.fvg ? `${plan.fvg.fillPercent}% fill` : "attente"} />
        <SetupMetric label="MA bias" value={activeAnalysis?.trendFilter ? `${activeAnalysis.trendFilter.type}${activeAnalysis.trendFilter.period} ${activeAnalysis.trendFilter.bias}` : plan.trendFilter ? `${plan.trendFilter.type}${plan.trendFilter.period} ${plan.trendFilter.bias}` : "attente"} />
      </div>
    </section>
  );
}

function SignalModePanel({
  activeAnalysis,
  mode,
  movingAveragePeriod,
  movingAverageType,
  onModeChange,
  onMovingAveragePeriodChange,
  onMovingAverageTypeChange,
  onOrbDurationChange,
  onOrbRequireRetestChange,
  onSensitivityChange,
  orbDuration,
  orbRequireRetest,
  plan,
  sensitivity,
}: {
  activeAnalysis?: TimeframeAnalysis;
  mode: SignalMode;
  movingAveragePeriod: number;
  movingAverageType: MovingAverageType;
  onModeChange: (mode: SignalMode) => void;
  onMovingAveragePeriodChange: (period: number) => void;
  onMovingAverageTypeChange: (type: MovingAverageType) => void;
  onOrbDurationChange: (duration: OrbDuration) => void;
  onOrbRequireRetestChange: (enabled: boolean) => void;
  onSensitivityChange: (sensitivity: ScalpingSensitivity) => void;
  orbDuration: OrbDuration;
  orbRequireRetest: boolean;
  plan: TradePlan;
  sensitivity: ScalpingSensitivity;
}) {
  const scalpActive = plan.decision === "WATCH BUY" || plan.decision === "WATCH SELL" || plan.decision === "ORB BREAKOUT WATCH" || plan.decision === "FVG RETEST WATCH" || plan.decision === "BUY SCALP READY" || plan.decision === "SELL SCALP READY" || plan.decision === "STRONG BUY" || plan.decision === "STRONG SELL";
  const missing = activeAnalysis?.missingConditions ?? plan.missingConditions;
  const orb = activeAnalysis?.orb ?? plan.orb;
  const fvg = activeAnalysis?.fvg ?? plan.fvg;
  const trendFilter = activeAnalysis?.trendFilter ?? plan.trendFilter;

  return (
    <section className="rounded-md border border-white/10 bg-[#171717] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-amber-100">
          <Zap size={17} />
          <p className="text-sm font-semibold">Signal Mode</p>
        </div>
        <div className="inline-flex rounded-md border border-white/10 bg-black/25 p-1">
          <ModeButton active={mode === "conservative"} label="Conservative" onClick={() => onModeChange("conservative")} />
          <ModeButton active={mode === "scalping"} label="Scalping" onClick={() => onModeChange("scalping")} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <SetupMetric label="Mode actif" value={mode === "scalping" ? "Scalping" : "Conservative"} />
        <SetupMetric label="Scalp status" value={scalpActive ? plan.decision : "WAIT"} />
        <SetupMetric label="Seuils" value="WATCH 50 / READY 58" />
        <SetupMetric label="Priorite" value="M1 / M5 puis M15" />
        <SetupMetric label="Sensibilite" value={formatSensitivity(sensitivity)} />
        <SetupMetric label="ORB status" value={orb?.status ?? "WAIT"} />
        <SetupMetric label="FVG" value={fvg ? `${fvg.direction} ${fvg.score}/100` : "attente"} />
        <SetupMetric label="MA bias" value={trendFilter ? `${trendFilter.type}${trendFilter.period} ${trendFilter.bias}` : `${movingAverageType}${movingAveragePeriod}`} />
      </div>
      <div className="mt-3 rounded-md border border-white/10 bg-black/25 p-2">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Scalping sensitivity</p>
        <div className="grid grid-cols-3 gap-1">
          <SensitivityButton active={sensitivity === "safe"} label="Safe" onClick={() => onSensitivityChange("safe")} />
          <SensitivityButton active={sensitivity === "balanced"} label="Balanced" onClick={() => onSensitivityChange("balanced")} />
          <SensitivityButton active={sensitivity === "aggressive"} label="Aggressive" onClick={() => onSensitivityChange("aggressive")} />
        </div>
      </div>
      <div className="mt-3 rounded-md border border-white/10 bg-black/25 p-2">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Opening Range Breakout</p>
        <div className="grid grid-cols-3 gap-1">
          {[5, 15, 30].map((duration) => (
            <SensitivityButton key={duration} active={orbDuration === duration} label={`${duration} min`} onClick={() => onOrbDurationChange(duration as OrbDuration)} />
          ))}
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-slate-300 transition hover:bg-white/[0.04]">
          <input className="size-4 accent-amber-300" type="checkbox" checked={orbRequireRetest} onChange={(event) => onOrbRequireRetestChange(event.target.checked)} />
          Require ORB retest confirmation
        </label>
      </div>
      <div className="mt-3 rounded-md border border-white/10 bg-black/25 p-2">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Trend MA filter</p>
        <div className="grid grid-cols-2 gap-1">
          <SensitivityButton active={movingAverageType === "EMA"} label="EMA" onClick={() => onMovingAverageTypeChange("EMA")} />
          <SensitivityButton active={movingAverageType === "SMA"} label="SMA" onClick={() => onMovingAverageTypeChange("SMA")} />
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <SensitivityButton active={movingAveragePeriod === 50} label="50" onClick={() => onMovingAveragePeriodChange(50)} />
          <SensitivityButton active={movingAveragePeriod === 200} label="200" onClick={() => onMovingAveragePeriodChange(200)} />
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          MA is a bias filter only. It blocks only when price is clearly against a strong trend.
        </p>
      </div>
      <p className="mt-3 rounded border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">
        Scalping has higher risk and requires strict stop loss.
      </p>
      <p className="mt-2 rounded border border-emerald-300/10 bg-emerald-300/5 px-3 py-2 text-xs leading-5 text-slate-300">
        ORB/FVG: {orb ? `${orb.status} (${orb.confidence}/100) - ${orb.missingConfirmation}` : "waiting London/New York range"} - {fvg ? `FVG ${fvg.fillState} fill ${fvg.fillPercent}% - ${fvg.missingConfirmation}` : "no fresh FVG"}
      </p>
      <p className="mt-2 rounded border border-white/10 bg-black/25 px-3 py-2 text-xs leading-5 text-slate-300">
        {mode === "scalping"
          ? missing.length
            ? `Avant READY: ${missing.join(", ")}`
            : "Scalp READY: attendre le trigger court indique avant execution."
          : "Passe en Scalping pour activer WATCH / SCALP READY sur M1, M5 et M15."}
      </p>
    </section>
  );
}

function TradingAlertsPanel({
  history,
  notificationStatus,
  onRequestPermission,
  onSettingsChange,
  onTestSound,
  settings,
}: {
  history: AlertHistoryItem[];
  notificationStatus: string;
  onRequestPermission: () => void;
  onSettingsChange: (settings: AlertSettings) => void;
  onTestSound: () => void;
  settings: AlertSettings;
}) {
  function update<K extends keyof AlertSettings>(key: K, value: AlertSettings[K]) {
    onSettingsChange({ ...settings, [key]: value });
  }

  return (
    <section className="rounded-md border border-white/10 bg-[#171717] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-amber-100">
          <BellRing size={17} />
          <p className="text-sm font-semibold">Trading Alerts</p>
        </div>
        <span className="rounded border border-white/10 bg-black/25 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300">
          Analysis only
        </span>
      </div>

      <div className="mt-3 grid gap-1.5 text-sm text-slate-200">
        <AlertToggle checked={settings.soundEnabled} label="Enable Sound Alerts" onChange={(value) => update("soundEnabled", value)} />
        <AlertToggle checked={settings.browserEnabled} label="Enable Browser Notifications" onChange={(value) => update("browserEnabled", value)} />
        <AlertToggle checked={settings.alertOnWatch} label="Alert on WATCH signals" onChange={(value) => update("alertOnWatch", value)} />
      </div>

      <div className="mt-3 rounded-md border border-white/10 bg-black/25 p-2">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Cooldown</p>
        <div className="grid grid-cols-4 gap-1">
          {alertCooldownOptions.map((option) => (
            <SensitivityButton key={option.value} active={settings.cooldownMs === option.value} label={option.label} onClick={() => update("cooldownMs", option.value)} />
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button className="inline-flex h-9 items-center justify-center gap-2 rounded border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]" type="button" onClick={onTestSound}>
          <Volume2 size={15} />
          Test sound
        </button>
        <button className="inline-flex h-9 items-center justify-center gap-2 rounded border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]" type="button" onClick={onRequestPermission}>
          <Bell size={15} />
          Request permission
        </button>
      </div>

      <p className="mt-3 rounded border border-sky-300/15 bg-sky-300/10 px-3 py-2 text-xs leading-5 text-sky-100">{notificationStatus}</p>
      {notificationStatus.includes("blocked") || notificationStatus.includes("Blocked") ? (
        <p className="mt-2 rounded border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">
          Browser blocked notifications. Open site settings for tradetsr.vercel.app and allow Notifications, then click Request permission again.
        </p>
      ) : null}

      <div className="mt-3 border-t border-white/10 pt-3">
        <div className="mb-2 flex items-center gap-2 text-slate-300">
          <Clock size={15} />
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Alert history</p>
        </div>
        <div className="space-y-1.5">
          {history.length ? (
            history.slice(0, 8).map((item) => (
              <div key={item.id} className="rounded-md border border-white/10 bg-black/25 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-white">{item.signal}</span>
                  <span className="font-mono text-[10px] text-slate-500">{formatAlertTime(item.time)}</span>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-300">XAUUSD {formatPrice(item.price)}</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">{item.reason}</p>
              </div>
            ))
          ) : (
            <p className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-xs leading-5 text-slate-400">No alerts yet. Alerts trigger only on real actionable setups unless WATCH alerts are enabled.</p>
          )}
        </div>
      </div>

      <p className="mt-3 rounded border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">
        Alert is for analysis only, not guaranteed profit. It never executes trades automatically.
      </p>
    </section>
  );
}

function AlertToggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 transition hover:bg-white/[0.04]">
      <input className="size-4 accent-amber-300" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function SensitivityButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={`h-8 rounded px-2 text-[11px] font-semibold transition ${active ? "bg-amber-200 text-black" : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"}`} type="button" onClick={onClick}>
      {label}
    </button>
  );
}

function ModeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={`h-8 rounded px-3 text-xs font-semibold transition ${
        active ? "bg-white text-black" : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
      }`}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function SetupMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-black/25 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-slate-200">{value}</p>
    </div>
  );
}

function formatSensitivity(sensitivity: ScalpingSensitivity) {
  if (sensitivity === "safe") {
    return "Safe";
  }

  if (sensitivity === "aggressive") {
    return "Aggressive";
  }

  return "Balanced";
}

function getTradingAlertCandidate({ alertOnWatch, plan, price }: { alertOnWatch: boolean; plan: TradePlan; price: number }): TradingAlertCandidate | null {
  const actionableSignals: Signal[] = ["BUY SCALP READY", "SELL SCALP READY", "STRONG BUY", "STRONG SELL"];
  const watchSignals: Signal[] = ["WATCH BUY", "WATCH SELL", "ORB BREAKOUT WATCH", "FVG RETEST WATCH"];
  const eligible = actionableSignals.includes(plan.decision) || (alertOnWatch && watchSignals.includes(plan.decision));

  if (!eligible) {
    return null;
  }

  const entryZone = plan.fvg ? `${formatPrice(plan.fvg.low)} - ${formatPrice(plan.fvg.high)}` : `Around ${formatPrice(plan.entry)}`;
  const id = [
    plan.decision,
    plan.direction,
    Math.round(plan.entry * 100),
    Math.round(plan.stopLoss * 100),
    Math.round(plan.takeProfits[0] * 100),
    Math.round(plan.score),
  ].join("|");
  const reason = plan.waitReason || plan.summary;
  const historyItem: AlertHistoryItem = {
    id: `${id}|${Date.now()}`,
    price,
    reason,
    signal: plan.decision,
    time: Date.now(),
  };

  return {
    body: `XAUUSD | Entry ${entryZone} | SL ${formatPrice(plan.stopLoss)} | TP1 ${formatPrice(plan.takeProfits[0])} | Confidence ${Math.round(plan.score)}%`,
    historyItem,
    id,
    reason,
    title: `${plan.decision} - XAUUSD`,
  };
}

function playAlertSound() {
  if (typeof window === "undefined") {
    return;
  }

  const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return;
  }

  const context = new AudioContextCtor();
  const gain = context.createGain();
  gain.connect(context.destination);
  gain.gain.setValueAtTime(0.001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.55);

  [0, 0.18, 0.36].forEach((offset, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(index === 1 ? 1046 : 784, context.currentTime + offset);
    oscillator.connect(gain);
    oscillator.start(context.currentTime + offset);
    oscillator.stop(context.currentTime + offset + 0.12);
  });

  window.setTimeout(() => {
    void context.close();
  }, 900);
}

function showBrowserNotification(candidate: TradingAlertCandidate, setNotificationStatus: (status: string) => void) {
  if (!("Notification" in window)) {
    setNotificationStatus("Browser notifications are not supported in this browser.");
    return;
  }

  if (Notification.permission === "denied") {
    setNotificationStatus("Notifications are blocked. Enable them in your browser site settings for tradetsr.vercel.app.");
    return;
  }

  if (Notification.permission !== "granted") {
    setNotificationStatus("Notifications not enabled. Click Request permission before browser alerts can appear.");
    return;
  }

  new Notification(candidate.title, {
    body: candidate.body,
    icon: "/icon.png",
    tag: candidate.id,
  });
  setNotificationStatus("Browser notification sent.");
}

function loadAlertSettings(): AlertSettings {
  if (typeof window === "undefined") {
    return defaultAlertSettings;
  }

  try {
    const saved = window.localStorage.getItem("tradetsr-alert-settings");
    return saved ? { ...defaultAlertSettings, ...JSON.parse(saved) } : defaultAlertSettings;
  } catch {
    return defaultAlertSettings;
  }
}

function loadAlertHistory(): AlertHistoryItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const saved = window.localStorage.getItem("tradetsr-alert-history");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function getNotificationStatus() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "Browser notifications are not supported in this browser.";
  }

  if (Notification.permission === "granted") {
    return "Browser notifications enabled.";
  }

  if (Notification.permission === "denied") {
    return "Notifications are blocked. Enable them in your browser site settings for tradetsr.vercel.app.";
  }

  return "Click Request permission to enable browser notifications.";
}

function formatAlertTime(value: number) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function LiquidityPanel({ liquidity }: { liquidity: LiquidityAnalysis | null | undefined }) {
  if (!liquidity) {
    return (
      <section className="rounded-md border border-white/10 bg-[#171717] p-3">
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
    <section className="rounded-md border border-white/10 bg-[#171717] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Analyse de Liquidite XAUUSD</h2>
          <p className="mt-1 text-xs text-slate-500">Session {liquidity.activeSession} - risque {liquidity.riskLevel}</p>
        </div>
        <span className={`rounded border px-2 py-1 font-mono text-xs font-semibold ${directional}`}>{liquidity.confidence}/100</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
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

      <p className={`mt-3 rounded-md border p-2.5 text-xs leading-5 ${caution ? "border-amber-300/25 bg-amber-300/10 text-amber-100" : "border-white/10 bg-black/25 text-slate-300"}`}>
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
      <section className="rounded-md border border-white/10 bg-[#171717] p-3">
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
    <section className={`rounded-md border ${border} bg-[#171717] p-3`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Order Block</h2>
          <p className={`mt-1 text-xs font-semibold uppercase tracking-[0.14em] ${accent}`}>
            {bullish ? "Bullish" : "Bearish"} - {orderBlock.strength}
          </p>
        </div>
        <span className={`rounded border px-2 py-1 font-mono text-xs font-semibold ${border} ${bg} ${accent}`}>{orderBlock.score}/100</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <SetupMetric label="Zone" value={`${orderBlock.low.toFixed(2)} - ${orderBlock.high.toFixed(2)}`} />
        <SetupMetric label="Freshness" value={orderBlock.fresh ? "fraiche" : `${orderBlock.retestCount} retest(s)`} />
        <SetupMetric label="BOS" value={orderBlock.bosConfirmed ? "confirme" : "absent"} />
        <SetupMetric label="Displacement" value={orderBlock.displacementConfirmed ? "fort" : "faible"} />
        <SetupMetric label="Liquidity sweep" value={orderBlock.liquiditySweep ? "confirme" : "absent"} />
        <SetupMetric label="FVG" value={orderBlock.fvg ? `${orderBlock.fvg.low.toFixed(2)} - ${orderBlock.fvg.high.toFixed(2)}` : "absent"} />
        <SetupMetric label="Risk/Reward" value={orderBlock.riskReward ? `1:${orderBlock.riskReward.toFixed(2)}` : "--"} />
        <SetupMetric label="ATR quality" value={orderBlock.atrQuality} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
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
    <section className="rounded-md border border-white/10 bg-[#171717] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <span className="text-slate-400">{icon}</span>
      </div>
      <div className="mt-3 space-y-2">{children}</div>
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

function formatDxyDirection(direction: FundamentalContext["dxy"]["direction"]) {
  if (direction === "rising") {
    return "Bullish USD";
  }

  if (direction === "falling") {
    return "Bearish USD";
  }

  return "Neutral";
}

function formatPrice(value?: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value.toFixed(2) : "--";
}

function formatTickTime(value?: number) {
  if (!value) {
    return "--";
  }

  return new Date(value * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

interface AlertSettings {
  alertOnWatch: boolean;
  browserEnabled: boolean;
  cooldownMs: number;
  soundEnabled: boolean;
}

interface AlertHistoryItem {
  id: string;
  price: number;
  reason: string;
  signal: Signal;
  time: number;
}

interface TradingAlertCandidate {
  body: string;
  historyItem: AlertHistoryItem;
  id: string;
  reason: string;
  title: string;
}
