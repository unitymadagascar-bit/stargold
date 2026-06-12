"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Activity, Bell, BellRing, Clock, Gauge, ShieldCheck, Target, Volume2, Wifi, WifiOff, Zap } from "lucide-react";
import type { AnalysisDepth, Candle, FundamentalContext, LiquidityAnalysis, LiveMarketState, MovingAverageType, OrbDuration, OrderBlockZone, QuickEntryMode, RiskSettings, ScalpingSensitivity, Signal, SignalMode, SymbolProfile, Timeframe, TimeframeAnalysis, TradePlan } from "@/types";
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
import { getSymbolProfile, getSymbolsByCategory, normalizeSymbol } from "@/lib/symbols/profiles";
import { defaultRiskSettings, normalizeRiskSettings } from "@/lib/risk/risk";
import { timeframeSeconds, timeframes } from "@/lib/market/timeframes";

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
  const [selectedSymbol, setSelectedSymbol] = useState("XAUUSD");
  const symbolProfile = useMemo(() => getSymbolProfile(selectedSymbol), [selectedSymbol]);
  const live = useLiveXauusd(symbolProfile.symbol);
  const fundamentals = useFundamentalContext();
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>("M15");
  const [signalMode, setSignalMode] = useState<SignalMode>("conservative");
  const [analysisDepth, setAnalysisDepth] = useState<AnalysisDepth>("deep");
  const [quickEntryMode, setQuickEntryMode] = useState<QuickEntryMode>("mixed");
  const [allowPremiumCounterTrend, setAllowPremiumCounterTrend] = useState(false);
  const [scalpingSensitivity, setScalpingSensitivity] = useState<ScalpingSensitivity>("balanced");
  const [orbDuration, setOrbDuration] = useState<OrbDuration>(30);
  const [orbRequireRetest, setOrbRequireRetest] = useState(false);
  const [movingAverageType, setMovingAverageType] = useState<MovingAverageType>("EMA");
  const [movingAveragePeriod, setMovingAveragePeriod] = useState(50);
  const [riskSettings, setRiskSettingsState] = useState<RiskSettings>(() => loadRiskSettings());
  const [alertSettings, setAlertSettings] = useState<AlertSettings>(() => loadAlertSettings());
  const [alertHistory, setAlertHistory] = useState<AlertHistoryItem[]>(() => loadAlertHistory());
  const [notificationStatus, setNotificationStatus] = useState("Checking browser notification support...");
  const lastAlertRef = useRef<{ id: string; time: number }>({ id: "", time: 0 });
  const spread = live.lastTick?.bid !== undefined && live.lastTick.ask !== undefined ? Math.abs(live.lastTick.ask - live.lastTick.bid) : null;
  const exnessSourceConfirmed = isExnessSource(live.source);
  const analysisCandleMap = useMemo(() => buildOfficialMt5AnalysisCandleMap(live), [live.candleMap, live.candleSync, live.lastTick?.time]);
  const hasCryptoOhlcFeed = symbolProfile.category === "Crypto" && Object.values(live.candleMap).some((candles) => candles.length >= 30);
  const cryptoTradingViewMode = isTradingViewCryptoSymbol(symbolProfile.symbol);
  const chartSourceLabel = cryptoTradingViewMode && !exnessSourceConfirmed ? "TradingView Crypto" : "MT5 Bridge";
  const analysisSourceLabel = exnessSourceConfirmed ? "Exness / MT5 Bridge" : symbolProfile.category === "Crypto" ? (hasCryptoOhlcFeed ? "Crypto OHLC Feed" : "TradingView visual mode") : "MT5 Bridge OHLC";
  const executionSourceLabel = exnessSourceConfirmed ? "Exness / MT5 Bridge" : "Exness WebTrading / MT5 Bridge non connecte";
  const syncState = getSyncState({ analysisSourceLabel, chartSourceLabel, executionSourceLabel, liveSource: live.source, symbolProfile });
  const dataCheck = useMemo(() => buildDataCheck({ activeTimeframe, candleMap: live.candleMap, analysisCandleMap, live, symbolProfile }), [activeTimeframe, analysisCandleMap, live, symbolProfile]);
  const dataSafeCandleMap = useMemo(() => (dataCheck.status === "SYNC OK" ? analysisCandleMap : createEmptyDashboardCandleMap()), [analysisCandleMap, dataCheck.status]);
  const timeframeAnalyses = useMemo(
    () => buildLiveTimeframeAnalyses({ allowPremiumCounterTrend, analysisDepth, analysisSource: live.source, candleMap: dataSafeCandleMap, fundamental: fundamentals.fundamental, macro: macroContext, mode: signalMode, movingAveragePeriod, movingAverageType, news: newsEvents, orbDuration, orbRequireRetest, quickEntryMode, scalpingSensitivity, spread, symbolProfile }),
    [allowPremiumCounterTrend, analysisDepth, dataSafeCandleMap, fundamentals.fundamental, live.source, movingAveragePeriod, movingAverageType, orbDuration, orbRequireRetest, quickEntryMode, scalpingSensitivity, signalMode, spread, symbolProfile],
  );
  const rawPlan = useMemo(
    () => buildLiveTradePlan({ allowPremiumCounterTrend, analysisDepth, analysisSource: live.source, candleMap: dataSafeCandleMap, fundamental: fundamentals.fundamental, macro: macroContext, mode: signalMode, movingAveragePeriod, movingAverageType, news: newsEvents, orbDuration, orbRequireRetest, preferredTimeframe: activeTimeframe, quickEntryMode, riskSettings, scalpingSensitivity, spread, symbolProfile }),
    [activeTimeframe, allowPremiumCounterTrend, analysisDepth, dataSafeCandleMap, fundamentals.fundamental, live.source, movingAveragePeriod, movingAverageType, orbDuration, orbRequireRetest, quickEntryMode, riskSettings, scalpingSensitivity, signalMode, spread, symbolProfile],
  );
  const plan = useMemo(() => guardPlanForDataSync(rawPlan, dataCheck), [dataCheck, rawPlan]);
  const latestPrice = getLatestPrice(analysisCandleMap) || getLatestPrice(live.candleMap);
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
    setNotificationStatus(getNotificationStatus());
  }, []);

  useEffect(() => {
    window.localStorage.setItem("tradetsr-alert-settings", JSON.stringify(alertSettings));
  }, [alertSettings]);

  useEffect(() => {
    window.localStorage.setItem("tradetsr-risk-settings", JSON.stringify(riskSettings));
  }, [riskSettings]);

  useEffect(() => {
    window.localStorage.setItem("tradetsr-alert-history", JSON.stringify(alertHistory.slice(0, 20)));
  }, [alertHistory]);

  useEffect(() => {
    const candidate = getTradingAlertCandidate({ alertOnWatch: alertSettings.alertOnWatch, analyses: timeframeAnalyses, price: latestPrice, symbol: symbolProfile.symbol });

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
    symbolProfile.symbol,
    timeframeAnalyses,
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
          ? "Notifications are blocked. Enable them in your browser site settings for stargold-chi.vercel.app."
          : "Notification permission was not granted yet.",
    );
  }

  function setRiskSettings(settings: RiskSettings) {
    setRiskSettingsState(normalizeRiskSettings(settings));
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1780px] px-3 py-3 sm:px-4 lg:px-5">
      <BrandHeader selectedSymbol={symbolProfile.symbol} />
      <SymbolSelector profile={symbolProfile} selectedSymbol={selectedSymbol} onSymbolChange={setSelectedSymbol} />
      <Mt5ConnectionHeader live={live} spread={spread} />
      <DataCheckPanel data={dataCheck} />

      <section className="grid gap-3 xl:grid-cols-[minmax(0,2.05fr)_minmax(340px,1fr)]">
        <MarketSummary
          activeAnalysis={activeAnalysis}
          latestCandle={latestCandle}
          plan={plan}
          price={latestPrice}
          priceChange={priceChange}
          priceChangePercent={priceChangePercent}
          symbolProfile={symbolProfile}
        />
        <MacroPanel fundamental={fundamentals.fundamental} liveMessage={live.message} plan={plan} spread={spread} symbolProfile={symbolProfile} />
      </section>

      <FinalTradingDecision activeAnalysis={activeAnalysis} activeTimeframe={activeTimeframe} analysisSourceLabel={analysisSourceLabel} chartSourceLabel={chartSourceLabel} executionSourceLabel={executionSourceLabel} fundamental={fundamentals.fundamental} plan={plan} syncState={syncState} />

      <section className="mt-3">
        <TimeframeGrid activeTimeframe={activeTimeframe} analyses={timeframeAnalyses} onTimeframeChange={setActiveTimeframe} />
      </section>

      <Disclaimer />

      <section className="mt-3 grid gap-3 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_280px] 2xl:grid-cols-[340px_minmax(760px,1fr)_360px]">
        <aside className="order-2 space-y-3 lg:order-1">
          <SignalModePanel
            activeAnalysis={activeAnalysis}
            analysisDepth={analysisDepth}
            mode={signalMode}
            movingAveragePeriod={movingAveragePeriod}
            movingAverageType={movingAverageType}
            onAnalysisDepthChange={setAnalysisDepth}
            onModeChange={handleSignalModeChange}
            onMovingAveragePeriodChange={setMovingAveragePeriod}
            onMovingAverageTypeChange={setMovingAverageType}
            onOrbDurationChange={setOrbDuration}
            onOrbRequireRetestChange={setOrbRequireRetest}
            onPremiumCounterTrendChange={setAllowPremiumCounterTrend}
            onQuickEntryModeChange={setQuickEntryMode}
            onSensitivityChange={setScalpingSensitivity}
            orbDuration={orbDuration}
            orbRequireRetest={orbRequireRetest}
            plan={plan}
            premiumCounterTrend={allowPremiumCounterTrend}
            quickEntryMode={quickEntryMode}
            sensitivity={scalpingSensitivity}
          />
          <TradingAlertsPanel
            history={alertHistory}
            notificationStatus={notificationStatus}
            onRequestPermission={requestNotificationPermission}
            onSettingsChange={setAlertSettings}
            onTestSound={playAlertSound}
            settings={alertSettings}
            symbol={symbolProfile.symbol}
          />
          <TradeChecklist />
        </aside>

        <div className="order-1 space-y-3 lg:order-2">
          <GoldChart
            candleMap={live.candleMap}
            candleSync={live.candleSync}
            connectionMessage={live.message}
            connectionSource={live.source}
            connectionStatus={live.status}
            executionSourceLabel={executionSourceLabel}
            lastTick={live.lastTick}
            orderBlock={activeAnalysis?.orderBlock ?? plan.orderBlock}
            fvg={activeAnalysis?.fvg ?? plan.fvg}
            orb={activeAnalysis?.orb ?? plan.orb}
            plan={plan}
            symbolProfile={symbolProfile}
            syncState={syncState}
            timeframe={activeTimeframe}
            onTimeframeChange={setActiveTimeframe}
          />

          <QuickAnalysisResultPanel plan={plan} />
          <MarketScenarioPanel plan={plan} />

          <section className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
            <ExecutionBlock title="Zones cles" icon={<Activity size={18} />}>
              <BlockRow label="Support proche" value={formatPrice(activeAnalysis?.support)} />
              <BlockRow label="Resistance proche" value={formatPrice(activeAnalysis?.resistance)} />
              <BlockRow label="Volatilite" value={activeAnalysis?.volatility ?? "attente"} />
            </ExecutionBlock>

            <ExecutionBlock title="Entree / SL" icon={<ShieldCheck size={18} />}>
              <BlockRow label="Entry" value={formatPrice(plan.entry)} />
              <BlockRow label="Stop loss" value={formatPrice(plan.stopLoss)} />
              <BlockRow label="Decision" value={plan.decision} />
              <BlockRow label="Moteur" value={symbolProfile.category} />
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

        <aside className="order-3 space-y-3 lg:col-span-2 xl:col-span-1">
          <SetupPanel activeAnalysis={activeAnalysis} activeTimeframe={activeTimeframe} candleCount={activeCandles.length} plan={plan} />
          <ScoreDetail activeAnalysis={activeAnalysis} analyses={timeframeAnalyses} fundamental={fundamentals.fundamental} plan={plan} price={latestPrice} spread={spread} />
          <LiquidityPanel liquidity={activeAnalysis?.liquidity ?? plan.liquidity} symbol={symbolProfile.symbol} />
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
          <RiskPanel plan={plan} settings={riskSettings} onSettingsChange={setRiskSettings} />
        </aside>
      </section>
    </main>
  );
}

interface DataCheckSummary {
  activeTimeframe: Timeframe;
  askLabel: string;
  bidLabel: string;
  brokerSymbol: string;
  loadedCandleCounts: Record<Timeframe, number>;
  usedCandleCounts: Record<Timeframe, number>;
  closedCandleLabel: string;
  exactSymbol: string;
  formingCandleLabel: string;
  lastCandleLabel: string;
  lastSyncLabel: string;
  localTimeLabel: string;
  serverTimeLabel: string;
  sourceLabel: string;
  spreadLabel: string;
  status: "SYNC OK" | "RETARD" | "HISTORIQUE INSUFFISANT" | "SOURCE DIFFERENTE";
  statusMessage: string;
  tradingViewWarning: string;
}

function DataCheckPanel({ data }: { data: DataCheckSummary }) {
  const statusClass =
    data.status === "SYNC OK"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : data.status === "RETARD"
        ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
        : "border-rose-300/25 bg-rose-300/10 text-rose-100";

  return (
    <section className="mt-3 rounded-md border border-white/10 bg-[#111418] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Data Check</p>
          <h2 className="mt-1 text-base font-black text-white">Synchronisation bougies MT5 / Exness</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">{data.statusMessage}</p>
        </div>
        <span className={`rounded border px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] ${statusClass}`}>{data.status}</span>
      </div>

      <div className="mt-3 grid gap-2 text-xs md:grid-cols-2 xl:grid-cols-4">
        <SetupMetric label="Symbole exact" value={data.exactSymbol} />
        <SetupMetric label="Symbole broker" value={data.brokerSymbol} />
        <SetupMetric label="Timeframe actif" value={data.activeTimeframe} />
        <SetupMetric label="Source analyse" value={data.sourceLabel} />
        <SetupMetric label="Bid actuel" value={data.bidLabel} />
        <SetupMetric label="Ask actuel" value={data.askLabel} />
        <SetupMetric label="Spread" value={data.spreadLabel} />
        <SetupMetric label="Bougies chargees" value={`M1=${data.loadedCandleCounts.M1} / M5=${data.loadedCandleCounts.M5} / M15=${data.loadedCandleCounts.M15} / H1=${data.loadedCandleCounts.H1}`} />
        <SetupMetric label="Bougies analyse" value={`M1=${data.usedCandleCounts.M1} / M5=${data.usedCandleCounts.M5} / M15=${data.usedCandleCounts.M15} / H1=${data.usedCandleCounts.H1}`} />
        <SetupMetric label="Derniere bougie recue" value={data.lastCandleLabel} />
        <SetupMetric label="Derniere bougie cloturee" value={data.closedCandleLabel} />
        <SetupMetric label="Bougie en formation" value={data.formingCandleLabel} />
        <SetupMetric label="Heure serveur MT5" value={data.serverTimeLabel} />
        <SetupMetric label="Heure locale" value={data.localTimeLabel} />
        <SetupMetric label="Derniere synchro" value={data.lastSyncLabel} />
      </div>

      <p className="mt-3 rounded-md border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-xs leading-5 text-sky-100">
        {data.tradingViewWarning}
      </p>
    </section>
  );
}

function MarketScenarioPanel({ plan }: { plan: TradePlan }) {
  const scenario = plan.marketScenario;
  const quick = plan.analysisDepth === "quick";

  return (
    <section className={`rounded-md border ${quick ? "border-amber-300/20 bg-amber-300/10" : "border-sky-300/20 bg-sky-300/10"} p-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            {quick ? "Scenario rapide du marche" : "Scenario avance du marche"}
          </p>
          <h3 className="mt-1 text-base font-black text-white">{quick ? scenario.quickScenario : scenario.advancedScenario}</h3>
        </div>
        <SignalBadge signal={plan.decision} />
      </div>

      {quick ? (
        <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
          <SetupMetric label="Signal actuel" value={plan.decision} />
          <SetupMetric label="Biais principal" value={scenario.primaryBias} />
          <SetupMetric label="Position du prix" value={scenario.pricePosition} />
          <SetupMetric label="Confirmation necessaire" value={scenario.requiredConfirmation} />
          <SetupMetric label="Score confiance" value={`${scenario.confidence}/100`} />
          <SetupMetric label="Etat entree" value={formatEntryState(scenario.entryState)} />
          <SetupMetric label="Niveau signal" value={formatSignalTiming(scenario.signalTiming)} />
          <SetupMetric label="Progression" value={`${scenario.movementProgress}%`} />
        </div>
      ) : (
        <div className="mt-3 grid gap-2 text-xs md:grid-cols-2 2xl:grid-cols-4">
          <SetupMetric label="Signal actuel" value={plan.decision} />
          <SetupMetric label="Score global" value={`${scenario.confidence}/100`} />
          <SetupMetric label="Phase du marche" value={formatMarketPhase(scenario.phase)} />
          <SetupMetric label="Risk/reward" value={plan.riskReward ? `1:${plan.riskReward.toFixed(2)}` : "--"} />
          <SetupMetric label="Confirmations validees" value={scenario.validatedConfirmations.slice(0, 3).join(" / ") || "--"} />
          <SetupMetric label="Confirmations manquantes" value={scenario.missingConfirmations.slice(0, 3).join(" / ") || "--"} />
          <SetupMetric label="Risques detectes" value={scenario.detectedRisks.slice(0, 3).join(" / ") || "Aucun risque majeur"} />
          <SetupMetric label="Invalidation" value={scenario.invalidationLevel ? formatPrice(scenario.invalidationLevel) : "--"} />
        </div>
      )}

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <p className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-xs leading-5 text-slate-300">
          {quick ? scenario.shortExplanation : scenario.detailedExplanation}
        </p>
        <p className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-xs leading-5 text-slate-300">
          <span className="font-semibold text-white">Scenario alternatif:</span> {scenario.alternativeScenario}
        </p>
      </div>
    </section>
  );
}

function QuickAnalysisResultPanel({ plan }: { plan: TradePlan }) {
  const quick = plan.quickAnalysis;

  if (plan.analysisDepth !== "quick" || !quick) {
    return null;
  }

  const tone =
    quick.signal === "BUY"
      ? "border-emerald-300/25 bg-emerald-300/10"
      : quick.signal === "SELL"
        ? "border-rose-300/25 bg-rose-300/10"
        : "border-amber-300/25 bg-amber-300/10";

  return (
    <section className={`rounded-md border p-3 ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Resultat Analyse Rapide</p>
          <h3 className="mt-1 text-xl font-black text-white">{quick.status}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-300">H1 donne la direction. M15 prepare la zone. M5 declenche le timing.</p>
        </div>
        <div className="flex items-center gap-2">
          <SignalBadge signal={quick.signal} />
          <span className="rounded-md border border-white/10 bg-black/25 px-3 py-2 font-mono text-sm font-black text-white">{quick.confidence}%</span>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs md:grid-cols-2 xl:grid-cols-4">
        <SetupMetric label="Tendance H1" value={quick.h1Trend} />
        <SetupMetric label="Mode entree" value={formatQuickEntryMode(quick.entryMode)} />
        <SetupMetric label="Timeframe entree" value={quick.entryTimeframe} />
        <SetupMetric label="Order Block principal" value={quick.orderBlockLabel} />
        <SetupMetric label="Zone entree" value={`${formatPrice(quick.entryZone.low)} - ${formatPrice(quick.entryZone.high)}`} />
        <SetupMetric label="Entry ideal" value={formatPrice(quick.idealEntry)} />
        <SetupMetric label="Stop Loss" value={formatPrice(quick.stopLoss)} />
        <SetupMetric label="Take Profit" value={formatPrice(quick.takeProfit)} />
        <SetupMetric label="Risk Reward" value={quick.riskReward ? `1:${quick.riskReward.toFixed(2)}` : "--"} />
        <SetupMetric label="RSI" value={quick.confirmations.rsi ? "Compatible" : "Non confirme"} />
        <SetupMetric label="Price Action" value={quick.confirmations.priceAction ? "Validee" : "A confirmer"} />
        <SetupMetric label="BOS / ChoCH" value={quick.confirmations.bosChoch ? "Detecte" : "A confirmer"} />
        <SetupMetric label="Contre-tendance" value={plan.counterTrend.active ? plan.counterTrend.allowed ? "Premium confirmee" : "Bloquee" : "Non"} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-white/10 bg-black/25 p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-200">Raisons principales</p>
          <div className="space-y-1.5 text-xs leading-5 text-slate-200">
            {quick.reasons.length ? quick.reasons.map((reason) => <p key={reason}>- {reason}</p>) : <p>- En attente de structure exploitable.</p>}
          </div>
        </div>
        <div className="rounded-md border border-white/10 bg-black/25 p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">A attendre</p>
          <div className="space-y-1.5 text-xs leading-5 text-slate-200">
            {quick.missing.length ? quick.missing.map((item) => <p key={item}>- {item}</p>) : <p>- Verifier manuellement spread, lot size et execution avant entree.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function formatQuickEntryMode(mode: QuickEntryMode) {
  if (mode === "safe") {
    return "Securise";
  }

  if (mode === "fast") {
    return "Rapide";
  }

  return "Mixte recommande";
}

function formatMarketPhase(phase: TradePlan["marketScenario"]["phase"]) {
  const labels: Record<TradePlan["marketScenario"]["phase"], string> = {
    "breakout": "Cassure",
    "consolidation-range": "Range / consolidation",
    "high-risk": "Risque eleve",
    "inside-buy-zone": "Dans zone achat",
    "inside-sell-zone": "Dans zone vente",
    "middle-zone": "Zone milieu",
    "near-buy-zone": "Proche zone achat",
    "near-sell-zone": "Proche zone vente",
    "retest": "Retest",
    "strong-trend": "Tendance forte",
  };

  return labels[phase];
}

function formatEntryState(state: TradePlan["marketScenario"]["entryState"]) {
  if (state === "confirmed-entry") {
    return "Entree confirmee";
  }

  if (state === "setup-forming") {
    return "Setup en formation";
  }

  return "Zone detectee";
}

function formatSignalTiming(timing: TradePlan["marketScenario"]["signalTiming"]) {
  if (timing === "pre-signal") {
    return "Pre-signal";
  }

  if (timing === "confirmed") {
    return "Confirme";
  }

  if (timing === "momentum-breakout") {
    return "Momentum breakout";
  }

  if (timing === "early-continuation") {
    return "Continuation rapide";
  }

  if (timing === "late") {
    return "Trop tard";
  }

  return "Aucun";
}

function BrandHeader({ selectedSymbol }: { selectedSymbol: string }) {
  return (
    <header className="mb-3 rounded-md border border-amber-300/20 bg-[#11100c] px-4 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.24)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <img className="size-14 shrink-0 rounded-md border border-amber-300/25 bg-black object-cover" src="/star-gold-icon.png" alt="Star Gold By TSR" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/80">Multi-symbol Trading Assistant For MT5</p>
            <h1 className="mt-1 text-2xl font-black tracking-normal text-white">Star Gold By TSR</h1>
            <p className="mt-1 text-xs text-slate-400">Exness symbols, live analysis, educational decisions, risk control.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            className="rounded-md border border-amber-300/35 bg-amber-300/15 px-3 py-2 font-bold text-amber-100 transition hover:bg-amber-300/25"
            href={`/strategy-chart?symbol=${encodeURIComponent(selectedSymbol)}`}
          >
            Ouvrir le graphique strategie
          </Link>
          <span className="rounded-md border border-amber-300/25 bg-amber-300/10 px-3 py-2 font-mono font-bold text-amber-100">MULTI-SYMBOL</span>
          <span className="rounded-md border border-white/10 bg-black/25 px-3 py-2 font-semibold text-slate-300">MT5 Bridge Ready</span>
          <a className="rounded-md border border-sky-300/20 bg-sky-300/10 px-3 py-2 font-semibold text-sky-100 transition hover:bg-sky-300/15" href="/settings/mt5-connection">
            Parametres MT5
          </a>
        </div>
      </div>
    </header>
  );
}

function SymbolSelector({ onSymbolChange, profile, selectedSymbol }: { onSymbolChange: (symbol: string) => void; profile: SymbolProfile; selectedSymbol: string }) {
  const groupedSymbols = useMemo(() => getSymbolsByCategory(), []);
  const allSymbols = useMemo(() => Object.values(groupedSymbols).flat().filter(Boolean) as SymbolProfile[], [groupedSymbols]);

  function handleSymbolInput(value: string) {
    const normalized = normalizeSymbol(value);
    onSymbolChange(normalized || "XAUUSD");
  }

  return (
    <section className="mb-3 rounded-md border border-white/10 bg-[#171717] px-4 py-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(240px,340px)_minmax(0,1fr)]">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500" htmlFor="symbol-select">
            Symbole Exness
          </label>
          <div className="mt-2 flex gap-2">
            <input
              className="h-10 min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 font-mono text-sm font-bold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300/45"
              id="symbol-select"
              list="tradetsr-symbols"
              placeholder="XAUUSD, BTCUSD, US30..."
              value={selectedSymbol}
              onChange={(event) => handleSymbolInput(event.target.value)}
            />
            <select
              className="h-10 rounded-md border border-white/10 bg-black/30 px-2 text-xs font-semibold text-slate-200 outline-none"
              value={profile.symbol}
              onChange={(event) => onSymbolChange(event.target.value)}
            >
              {Object.entries(groupedSymbols).map(([category, symbols]) => (
                <optgroup key={category} label={category}>
                  {(symbols ?? []).map((item) => (
                    <option key={item.symbol} value={item.symbol}>
                      {item.symbol}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <datalist id="tradetsr-symbols">
            {allSymbols.map((item) => (
              <option key={item.symbol} value={item.symbol}>
                {item.label}
              </option>
            ))}
          </datalist>
        </div>

        <div className="grid gap-2 text-xs md:grid-cols-4">
          <SymbolInfo label="Categorie" value={profile.category} />
          <SymbolInfo label="Volatilite" value={profile.volatility} />
          <SymbolInfo label="Sessions" value={profile.sessions.join(" / ")} />
          <SymbolInfo label="News" value={profile.importantNews.slice(0, 3).join(" / ")} />
          <div className="rounded-md border border-amber-300/15 bg-amber-300/10 px-3 py-2 md:col-span-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">Strategie recommandee</p>
            <p className="mt-1 leading-5 text-amber-50">{profile.strategy}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SymbolInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/25 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 truncate font-semibold text-white">{value}</p>
    </div>
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
  symbolProfile,
}: {
  activeAnalysis?: TimeframeAnalysis;
  latestCandle: { open: number; high: number; low: number; close: number } | null;
  plan: TradePlan;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  symbolProfile: SymbolProfile;
}) {
  const missed = plan.decision === "SIGNAL MISSED";
  const bearish = !missed && plan.decision !== "WAIT" && (plan.direction === "Bearish" || plan.decision === "PRE-SIGNAL SELL" || plan.decision === "WATCH SELL" || plan.decision === "SELL SCALP READY" || plan.decision === "SELL" || plan.decision === "STRONG SELL");
  const bullish = !missed && plan.decision !== "WAIT" && (plan.direction === "Bullish" || plan.decision === "PRE-SIGNAL BUY" || plan.decision === "WATCH BUY" || plan.decision === "BUY SCALP READY" || plan.decision === "BUY" || plan.decision === "STRONG BUY");
  const scoreColor = bullish ? "#22c55e" : bearish ? "#ff333d" : "#f59e0b";

  return (
    <section className="rounded-md border border-white/10 bg-[#171717] p-4 shadow-[0_20px_55px_rgba(0,0,0,0.22)]">
      <div className="grid min-h-[188px] gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
            <span>{symbolProfile.symbol} - {symbolProfile.label}</span>
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
          <p className="mt-2 text-xs text-slate-500">Source: MT5 cloud bridge pour {symbolProfile.symbol}. Fallback externe seulement si disponible.</p>
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

function MacroPanel({ fundamental, liveMessage, plan, spread, symbolProfile }: { fundamental: FundamentalContext; liveMessage: string; plan: TradePlan; spread: number | null; symbolProfile: SymbolProfile }) {
  return (
    <section className="rounded-md border border-white/10 bg-[#171717] p-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Contexte Macro</h2>
      <div className="mt-4 space-y-3">
        <MacroRow label="DXY" value={fundamental.dxy.value ? fundamental.dxy.value.toFixed(2) : "--"} helper={formatDxyDirection(fundamental.dxy.direction)} positive={fundamental.dxy.direction === "falling"} />
        <MacroRow label="US10Y" value={macroContext.us10yDirection} helper={symbolProfile.category === "Metals" ? "impact inverse metals" : "risk sentiment"} positive={macroContext.us10yDirection === "Bearish"} />
        <div className="border-t border-white/10 pt-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Coherence {symbolProfile.symbol} / DXY / news</p>
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
        <div className="border-t border-white/10 pt-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Profil symbole</p>
          <p className="mt-1 text-xs leading-5 text-slate-300">{symbolProfile.category} - {symbolProfile.strategy}</p>
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
        Les decisions multi-symboles sont educatives, probabilistes et non garanties; aucune execution automatique n'est effectuee.
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
      {plan.counterTrend.active ? (
        <div className={`mt-3 rounded-md border p-2.5 ${plan.counterTrend.allowed ? "border-amber-300/25 bg-amber-300/10" : "border-rose-300/25 bg-rose-300/10"}`}>
          <p className="text-sm font-black text-white">{plan.counterTrend.allowed ? "CONTRE-TENDANCE CONFIRMEE" : "Contre-tendance bloquee"}</p>
          <p className="mt-1 text-xs leading-5 text-slate-200">{plan.counterTrend.warning}</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">Score {plan.counterTrend.score}/{plan.counterTrend.threshold}</p>
        </div>
      ) : null}
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
  analysisDepth,
  mode,
  movingAveragePeriod,
  movingAverageType,
  onAnalysisDepthChange,
  onModeChange,
  onMovingAveragePeriodChange,
  onMovingAverageTypeChange,
  onOrbDurationChange,
  onOrbRequireRetestChange,
  onPremiumCounterTrendChange,
  onQuickEntryModeChange,
  onSensitivityChange,
  orbDuration,
  orbRequireRetest,
  plan,
  premiumCounterTrend,
  quickEntryMode,
  sensitivity,
}: {
  activeAnalysis?: TimeframeAnalysis;
  analysisDepth: AnalysisDepth;
  mode: SignalMode;
  movingAveragePeriod: number;
  movingAverageType: MovingAverageType;
  onAnalysisDepthChange: (depth: AnalysisDepth) => void;
  onModeChange: (mode: SignalMode) => void;
  onMovingAveragePeriodChange: (period: number) => void;
  onMovingAverageTypeChange: (type: MovingAverageType) => void;
  onOrbDurationChange: (duration: OrbDuration) => void;
  onOrbRequireRetestChange: (enabled: boolean) => void;
  onPremiumCounterTrendChange: (enabled: boolean) => void;
  onQuickEntryModeChange: (mode: QuickEntryMode) => void;
  onSensitivityChange: (sensitivity: ScalpingSensitivity) => void;
  orbDuration: OrbDuration;
  orbRequireRetest: boolean;
  plan: TradePlan;
  premiumCounterTrend: boolean;
  quickEntryMode: QuickEntryMode;
  sensitivity: ScalpingSensitivity;
}) {
  const scalpActive =
    plan.decision === "PRE-SIGNAL BUY" ||
    plan.decision === "PRE-SIGNAL SELL" ||
    plan.decision === "WATCH BUY" ||
    plan.decision === "WATCH SELL" ||
    plan.decision === "ORB BREAKOUT WATCH" ||
    plan.decision === "FVG RETEST WATCH" ||
    plan.decision === "BUY SCALP READY" ||
    plan.decision === "SELL SCALP READY" ||
    plan.decision === "STRONG BUY" ||
    plan.decision === "STRONG SELL";
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
      <div className="mt-2 grid grid-cols-2 gap-1 rounded-md border border-white/10 bg-black/25 p-1">
        <ModeButton active={analysisDepth === "quick"} label="Analyse rapide" onClick={() => onAnalysisDepthChange("quick")} />
        <ModeButton active={analysisDepth === "deep"} label="Analyse approfondie" onClick={() => onAnalysisDepthChange("deep")} />
      </div>
      <div className="mt-2 rounded-md border border-amber-300/15 bg-amber-300/5 p-2">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200">Entree Analyse rapide</p>
        <div className="grid grid-cols-3 gap-1">
          <SensitivityButton active={quickEntryMode === "safe"} label="Securise" onClick={() => onQuickEntryModeChange("safe")} />
          <SensitivityButton active={quickEntryMode === "fast"} label="Rapide" onClick={() => onQuickEntryModeChange("fast")} />
          <SensitivityButton active={quickEntryMode === "mixed"} label="Mixte" onClick={() => onQuickEntryModeChange("mixed")} />
        </div>
      </div>
      <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-md border border-rose-300/20 bg-rose-300/10 p-2 text-xs leading-5 text-rose-50">
        <input className="mt-1 size-4 accent-rose-300" type="checkbox" checked={premiumCounterTrend} onChange={(event) => onPremiumCounterTrendChange(event.target.checked)} />
        <span>
          <span className="block font-bold text-white">Autoriser les trades contre-tendance premium</span>
          Desactive par defaut. Seuil strict 85% avec zone HTF, sweep/rejet, ChoCH ou FVG/retest et RR valide.
        </span>
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <SetupMetric label="Mode actif" value={mode === "scalping" ? "Scalping" : "Conservative"} />
        <SetupMetric label="Analyse" value={analysisDepth === "quick" ? "Rapide" : "Approfondie"} />
        <SetupMetric label="Scalp status" value={scalpActive ? plan.decision : "WAIT"} />
        <SetupMetric label="Seuils" value={analysisDepth === "quick" ? "BUY/SELL 58" : "WATCH 50 / READY 58"} />
        <SetupMetric label="Priorite rapide" value={quickEntryMode === "safe" ? "H1 -> M15" : quickEntryMode === "fast" ? "H1 -> M5" : "H1 -> M15 -> M5"} />
        <SetupMetric label="Sensibilite" value={formatSensitivity(sensitivity)} />
        <SetupMetric label="Contre-tendance" value={premiumCounterTrend ? "Premium strict actif" : "Bloquee"} />
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
  symbol,
}: {
  history: AlertHistoryItem[];
  notificationStatus: string;
  onRequestPermission: () => void;
  onSettingsChange: (settings: AlertSettings) => void;
  onTestSound: () => void;
  settings: AlertSettings;
  symbol: string;
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
          Browser blocked notifications. Open site settings for stargold-chi.vercel.app and allow Notifications, then click Request permission again.
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
                  <span className="font-mono text-xs font-bold text-white">{item.timeframe ? `${item.signal} ${item.timeframe}` : item.signal}</span>
                  <span className="font-mono text-[10px] text-slate-500">{formatAlertTime(item.time)}</span>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-300">{item.symbol ?? symbol} {formatPrice(item.price)}</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">{item.reason}</p>
              </div>
            ))
          ) : (
            <p className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-xs leading-5 text-slate-400">No {symbol} alerts yet. Alerts trigger only on real actionable setups unless WATCH alerts are enabled.</p>
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

const alertTimeframes: Timeframe[] = ["M1", "M5", "M15", "M30"];

function getTradingAlertCandidate({ alertOnWatch, analyses, price, symbol }: { alertOnWatch: boolean; analyses: TimeframeAnalysis[]; price: number; symbol: string }): TradingAlertCandidate | null {
  const directSignals: Signal[] = ["BUY", "SELL", "BUY SCALP READY", "SELL SCALP READY", "STRONG BUY", "STRONG SELL"];
  const preSignals: Signal[] = ["PRE-SIGNAL BUY", "PRE-SIGNAL SELL"];
  const watchSignals: Signal[] = ["WATCH BUY", "WATCH SELL"];
  const candidates = alertTimeframes
    .map((timeframe) => analyses.find((analysis) => analysis.timeframe === timeframe))
    .filter((analysis): analysis is TimeframeAnalysis => Boolean(analysis))
    .filter((analysis) => directSignals.includes(analysis.signal) || preSignals.includes(analysis.signal) || analysis.marketScenario.signalTiming === "pre-signal" || (alertOnWatch && watchSignals.includes(analysis.signal)))
    .sort((a, b) => getAlertSignalPriority(b.signal) - getAlertSignalPriority(a.signal) || b.score - a.score);
  const analysis = candidates[0];

  if (!analysis) {
    return null;
  }

  const entryZone = getAlertEntryZone(analysis, price);
  const stopLoss = getAlertStopLoss(analysis, price);
  const takeProfit = getAlertTakeProfit(analysis, price);
  const id = [
    symbol,
    analysis.timeframe,
    analysis.signal,
    Math.round(price * 100),
    Math.round(analysis.score),
  ].join("|");
  const preSignal = preSignals.includes(analysis.signal) || analysis.marketScenario.signalTiming === "pre-signal";
  const reason = preSignal ? analysis.marketScenario.shortExplanation : analysis.waitReason || analysis.summary;
  const historyItem: AlertHistoryItem = {
    id: `${id}|${Date.now()}`,
    price,
    reason,
    signal: analysis.signal,
    symbol,
    timeframe: analysis.timeframe,
    time: Date.now(),
  };

  return {
    body: `${symbol} ${analysis.timeframe} | Entry ${entryZone} | SL ${stopLoss} | TP1 ${takeProfit} | Confidence ${Math.round(analysis.score)}%`,
    historyItem,
    id,
    reason,
    title: `${analysis.signal} ${analysis.timeframe} - ${symbol}`,
  };
}

function getAlertSignalPriority(signal: Signal) {
  if (signal === "BUY" || signal === "SELL" || signal === "BUY SCALP READY" || signal === "SELL SCALP READY" || signal === "STRONG BUY" || signal === "STRONG SELL") {
    return 2;
  }

  if (signal === "PRE-SIGNAL BUY" || signal === "PRE-SIGNAL SELL") {
    return 1.5;
  }

  if (signal === "WATCH BUY" || signal === "WATCH SELL") {
    return 1;
  }

  return 0;
}

function getAlertEntryZone(analysis: TimeframeAnalysis, price: number) {
  if (analysis.fvg) {
    return `${formatPrice(analysis.fvg.low)} - ${formatPrice(analysis.fvg.high)}`;
  }

  if (analysis.orderBlock) {
    return `${formatPrice(analysis.orderBlock.low)} - ${formatPrice(analysis.orderBlock.high)}`;
  }

  return `Around ${formatPrice(price)}`;
}

function getAlertStopLoss(analysis: TimeframeAnalysis, price: number) {
  if (analysis.signal.includes("BUY")) {
    return formatPrice(analysis.support || price - analysis.atr);
  }

  return formatPrice(analysis.resistance || price + analysis.atr);
}

function getAlertTakeProfit(analysis: TimeframeAnalysis, price: number) {
  if (analysis.signal.includes("BUY")) {
    return formatPrice(analysis.resistance || price + analysis.atr);
  }

  return formatPrice(analysis.support || price - analysis.atr);
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
    setNotificationStatus("Notifications are blocked. Enable them in your browser site settings for stargold-chi.vercel.app.");
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

function loadRiskSettings(): RiskSettings {
  if (typeof window === "undefined") {
    return defaultRiskSettings;
  }

  try {
    const saved = window.localStorage.getItem("tradetsr-risk-settings");
    return normalizeRiskSettings(saved ? JSON.parse(saved) : defaultRiskSettings);
  } catch {
    return defaultRiskSettings;
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
    return "Notifications are blocked. Enable them in your browser site settings for stargold-chi.vercel.app.";
  }

  return "Click Request permission to enable browser notifications.";
}

function isTradingViewCryptoSymbol(symbol: string) {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized === "BTCUSD" || normalized === "BTCUSDT" || normalized === "ETHUSD" || normalized === "ETHUSDT";
}

function isExnessSource(source: string | null | undefined) {
  if (!source) {
    return false;
  }

  const normalized = source.toLowerCase();
  return normalized.includes("mt5") || normalized.includes("exness") || normalized.includes("bridge");
}

function getSyncState({
  analysisSourceLabel,
  chartSourceLabel,
  executionSourceLabel,
  liveSource,
  symbolProfile,
}: {
  analysisSourceLabel: string;
  chartSourceLabel: string;
  executionSourceLabel: string;
  liveSource: string | null;
  symbolProfile: SymbolProfile;
}): SyncState {
  const crypto = isTradingViewCryptoSymbol(symbolProfile.symbol);
  const exnessConfirmed = isExnessSource(liveSource);

  if (!crypto) {
    return {
      message: exnessConfirmed ? "Graphique, analyse et execution sont alignes sur le bridge MT5." : "En attente de confirmation Exness/MT5 Bridge.",
      priceWarning: null,
      status: exnessConfirmed ? "SYNC OK" : "PARTIAL SYNC",
    };
  }

  if (exnessConfirmed && analysisSourceLabel.includes("MT5")) {
    return {
      message: "BTC/ETH synchronise avec Exness/MT5 Bridge. Le scalping peut utiliser les niveaux calcules.",
      priceWarning: null,
      status: "SYNC OK",
    };
  }

  if (analysisSourceLabel === "Crypto OHLC Feed") {
    return {
      message: "Attention : le prix de l'analyse ne correspond pas exactement au prix Exness. Le scalping est desactive jusqu'a synchronisation.",
      priceWarning: `${symbolProfile.symbol}: prix indicatif externe, peut differer d'Exness. Alerte ecart: BTCUSD > 10-20 USD, ETHUSD > 2-5 USD.`,
      status: "NOT SYNCED",
    };
  }

  return {
    message: chartSourceLabel.includes("TradingView") ? "Graphique alternatif actif, mais analyse limitee sans source Exness confirmee." : `Source execution: ${executionSourceLabel}.`,
    priceWarning: "Attention : le prix de l'analyse ne correspond pas exactement au prix Exness. Le scalping est desactive jusqu'a synchronisation.",
    status: "PARTIAL SYNC",
  };
}

function formatAlertTime(value: number) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function LiquidityPanel({ liquidity, symbol }: { liquidity: LiquidityAnalysis | null | undefined; symbol: string }) {
  if (!liquidity) {
    return (
      <section className="rounded-md border border-white/10 bg-[#171717] p-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white">Analyse de Liquidite {symbol}</h2>
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
          <h2 className="text-base font-semibold text-white">Analyse de Liquidite {symbol}</h2>
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

function buildOfficialMt5AnalysisCandleMap(live: LiveMarketState): Record<Timeframe, Candle[]> {
  return timeframes.reduce(
    (map, timeframe) => {
      const sync = live.candleSync[timeframe];
      map[timeframe] = sync?.official ? getClosedOfficialCandles(live.candleMap[timeframe], live.lastTick?.time, timeframe) : [];
      return map;
    },
    {} as Record<Timeframe, Candle[]>,
  );
}

function createEmptyDashboardCandleMap(): Record<Timeframe, Candle[]> {
  return timeframes.reduce(
    (map, timeframe) => {
      map[timeframe] = [];
      return map;
    },
    {} as Record<Timeframe, Candle[]>,
  );
}

function guardPlanForDataSync(plan: TradePlan, dataCheck: DataCheckSummary): TradePlan {
  if (dataCheck.status === "SYNC OK") {
    return plan;
  }

  const reason =
    dataCheck.status === "SOURCE DIFFERENTE"
      ? "Analyse suspendue : donnees non synchronisees. Source graphique/analyse differente de MT5/Exness."
      : dataCheck.status === "RETARD"
        ? "Analyse suspendue : donnees non synchronisees. La derniere synchronisation MT5 est en retard."
        : "Historique insuffisant pour analyse fiable.";
  const waitReason =
    dataCheck.status === "SOURCE DIFFERENTE"
      ? "WAIT : donnees non synchronisees"
      : dataCheck.status === "RETARD"
        ? "WAIT : donnees non synchronisees"
        : "WAIT : historique insuffisant";

  return {
    ...plan,
    alerts: [reason, ...plan.alerts],
    decision: "WAIT",
    directionalBias: "Neutral",
    direction: "Neutral",
    entryConfirmation: "Not confirmed",
    entryRiskLevel: "High",
    missingConditions: [waitReason, reason, ...plan.missingConditions],
    score: Math.min(plan.score, 25),
    signalReason: reason,
    summary: reason,
    waitFor: dataCheck.status === "HISTORIQUE INSUFFISANT" ? "Charger assez de bougies OHLC MT5 officielles." : "Retablir une source MT5/Exness synchronisee.",
    waitReason,
  };
}

function getClosedOfficialCandles(candles: Candle[], tickTime: number | undefined, timeframe: Timeframe) {
  const last = candles.at(-1);

  if (!last || !tickTime) {
    return candles;
  }

  const candleCloseTime = last.time + timeframeSeconds[timeframe];
  return tickTime < candleCloseTime ? candles.slice(0, -1) : candles;
}

function buildDataCheck({
  activeTimeframe,
  analysisCandleMap,
  candleMap,
  live,
  symbolProfile,
}: {
  activeTimeframe: Timeframe;
  analysisCandleMap: Record<Timeframe, Candle[]>;
  candleMap: Record<Timeframe, Candle[]>;
  live: LiveMarketState;
  symbolProfile: SymbolProfile;
}): DataCheckSummary {
  const activeSync = live.candleSync[activeTimeframe];
  const activeAnalysisCandles = analysisCandleMap[activeTimeframe];
  const activeDisplayCandles = candleMap[activeTimeframe];
  const lastDisplayCandle = activeDisplayCandles.at(-1) ?? null;
  const isForming = Boolean(lastDisplayCandle && live.lastTick && live.lastTick.time < lastDisplayCandle.time + timeframeSeconds[activeTimeframe]);
  const closedCandle = isForming ? activeDisplayCandles.at(-2) ?? null : lastDisplayCandle;
  const lastSync = getLatestSyncTime(live);
  const staleMs = lastSync ? Date.now() - Date.parse(lastSync) : Number.POSITIVE_INFINITY;
  const loadedCounts = timeframes.reduce(
    (accumulator, timeframe) => ({
      ...accumulator,
      [timeframe]: candleMap[timeframe].length,
    }),
    {} as Record<Timeframe, number>,
  );
  const usedCounts = timeframes.reduce(
    (accumulator, timeframe) => ({
      ...accumulator,
      [timeframe]: analysisCandleMap[timeframe].length,
    }),
    {} as Record<Timeframe, number>,
  );
  const enoughCoreHistory = usedCounts.M1 >= 50 && usedCounts.M5 >= 50 && usedCounts.M15 >= 50;
  const sourceLabel = activeSync?.source ?? live.source ?? "unavailable";
  const brokerSymbol = activeSync?.brokerSymbol ?? live.brokerSymbol ?? live.lastTick?.symbol ?? symbolProfile.symbol;
  const loadedAny = Object.values(loadedCounts).some((count) => count > 0);
  const sourceDifferent = loadedAny && (!activeSync?.official || !isExnessSource(sourceLabel));
  const status: DataCheckSummary["status"] = sourceDifferent ? "SOURCE DIFFERENTE" : !enoughCoreHistory ? "HISTORIQUE INSUFFISANT" : staleMs > 20_000 ? "RETARD" : "SYNC OK";
  const statusMessage =
    status === "SYNC OK"
      ? "Les signaux utilisent les bougies OHLC MT5/Exness disponibles. Les bougies en formation restent non confirmees."
      : status === "RETARD"
        ? "La derniere synchronisation MT5 est en retard. Evite les signaux scalping tant que le flux n'est pas frais."
        : status === "SOURCE DIFFERENTE"
          ? "Analyse suspendue : la source affichee ou chargee n'est pas confirmee MT5/Exness. Les signaux BUY/SELL sont bloques."
          : "Historique insuffisant pour analyse fiable. Les signaux sont bloques tant que les OHLC MT5 officiels ne sont pas charges.";
  const spreadValue = live.lastTick?.bid !== undefined && live.lastTick.ask !== undefined ? Math.abs(live.lastTick.ask - live.lastTick.bid) : null;

  return {
    activeTimeframe,
    askLabel: formatPrice(live.lastTick?.ask),
    bidLabel: formatPrice(live.lastTick?.bid),
    brokerSymbol,
    loadedCandleCounts: loadedCounts,
    usedCandleCounts: usedCounts,
    closedCandleLabel: closedCandle ? formatCandleLabel(closedCandle) : "--",
    exactSymbol: symbolProfile.symbol,
    formingCandleLabel: isForming && lastDisplayCandle ? formatCandleLabel(lastDisplayCandle) : "Aucune bougie en formation detectee",
    lastCandleLabel: lastDisplayCandle ? formatCandleLabel(lastDisplayCandle) : "--",
    lastSyncLabel: lastSync ? new Date(lastSync).toLocaleString("fr-FR", { hour12: false }) : "--",
    localTimeLabel: new Date().toLocaleString("fr-FR", { hour12: false }),
    serverTimeLabel: live.lastTick ? formatTickDateTime(live.lastTick.time) : "--",
    sourceLabel,
    spreadLabel: spreadValue === null ? "--" : spreadValue.toFixed(symbolProfile.category === "Forex" ? 5 : 2),
    status,
    statusMessage,
    tradingViewWarning: "TradingView peut differer de MT5 si le broker/source n'est pas identique. Les signaux de trading sont bases sur les bougies OHLC MT5/Exness officielles quand elles sont disponibles.",
  };
}

function getLatestSyncTime(live: LiveMarketState) {
  const candidates = Object.values(live.candleSync)
    .map((sync) => sync.updatedAt)
    .filter((value): value is string => Boolean(value));

  if (!candidates.length) {
    return null;
  }

  return candidates.sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

function formatCandleLabel(candle: Candle) {
  return `${formatTickDateTime(candle.time)} O ${formatPrice(candle.open)} H ${formatPrice(candle.high)} L ${formatPrice(candle.low)} C ${formatPrice(candle.close)}`;
}

function formatTickDateTime(value?: number) {
  if (!value) {
    return "--";
  }

  return new Date(value * 1000).toLocaleString("fr-FR", { hour12: false });
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
  symbol: string;
  timeframe?: Timeframe;
  time: number;
}

export interface SyncState {
  message: string;
  priceWarning: string | null;
  status: "SYNC OK" | "PARTIAL SYNC" | "NOT SYNCED";
}

interface TradingAlertCandidate {
  body: string;
  historyItem: AlertHistoryItem;
  id: string;
  reason: string;
  title: string;
}
