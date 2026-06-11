"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { BarChart3, CheckCircle2, Eye, EyeOff, Gauge, Layers3, Target, Zap } from "lucide-react";
import type { QuickEntryMode, SymbolProfile, Timeframe } from "@/types";
import { GoldChart } from "@/components/chart/gold-chart";
import { SignalBadge } from "@/components/ui/signal-badge";
import { useFundamentalContext } from "@/hooks/use-fundamental-context";
import { useLiveXauusd } from "@/hooks/use-live-xauusd";
import { buildLiveTimeframeAnalyses, buildLiveTradePlan } from "@/lib/analysis/live-analysis";
import { macroContext, newsEvents } from "@/lib/static-context";
import { defaultRiskSettings } from "@/lib/risk/risk";
import { getSymbolProfile, getSymbolsByCategory, normalizeSymbol } from "@/lib/symbols/profiles";

const strategyTimeframes: Timeframe[] = ["M5", "M15", "H1"];

export function StrategyChartPage({ initialSymbol }: { initialSymbol: string }) {
  const [selectedSymbol, setSelectedSymbol] = useState(normalizeSymbol(initialSymbol) || "XAUUSD");
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>("M5");
  const [entryMode, setEntryMode] = useState<QuickEntryMode>("mixed");
  const [showReasonPanel, setShowReasonPanel] = useState(true);
  const symbolProfile = useMemo(() => getSymbolProfile(selectedSymbol), [selectedSymbol]);
  const live = useLiveXauusd(symbolProfile.symbol);
  const fundamentals = useFundamentalContext();
  const spread = live.lastTick?.bid !== undefined && live.lastTick.ask !== undefined ? Math.abs(live.lastTick.ask - live.lastTick.bid) : null;
  const analyses = useMemo(
    () =>
      buildLiveTimeframeAnalyses({
        analysisDepth: "quick",
        analysisSource: live.source,
        candleMap: live.candleMap,
        fundamental: fundamentals.fundamental,
        macro: macroContext,
        mode: "scalping",
        news: newsEvents,
        quickEntryMode: entryMode,
        spread,
        symbolProfile,
      }),
    [activeTimeframe, entryMode, fundamentals.fundamental, live.candleMap, live.source, spread, symbolProfile],
  );
  const plan = useMemo(
    () =>
      buildLiveTradePlan({
        analysisDepth: "quick",
        analysisSource: live.source,
        candleMap: live.candleMap,
        fundamental: fundamentals.fundamental,
        macro: macroContext,
        mode: "scalping",
        news: newsEvents,
        preferredTimeframe: activeTimeframe,
        quickEntryMode: entryMode,
        riskSettings: defaultRiskSettings,
        spread,
        symbolProfile,
      }),
    [activeTimeframe, entryMode, fundamentals.fundamental, live.candleMap, live.source, spread, symbolProfile],
  );
  const activeAnalysis = analyses.find((analysis) => analysis.timeframe === activeTimeframe);
  const quick = plan.quickAnalysis;
  const chartSourceLabel = isExnessSource(live.source) ? "MT5 Bridge" : symbolProfile.category === "Crypto" ? "TradingView Crypto" : "MT5 Bridge";
  const analysisSourceLabel = isExnessSource(live.source) ? "Exness / MT5 Bridge" : symbolProfile.category === "Crypto" ? "Crypto OHLC / visual fallback" : "MT5 Bridge OHLC";
  const executionSourceLabel = isExnessSource(live.source) ? "Exness / MT5 Bridge" : "Execution Exness non synchronisee";
  const syncState = isExnessSource(live.source)
    ? { message: "Graphique, analyse et execution alignes sur MT5.", priceWarning: null, status: "SYNC OK" as const }
    : { message: "Source non confirmee Exness. Analyse educative, scalping a valider avec MT5.", priceWarning: null, status: "PARTIAL SYNC" as const };

  function handleSymbolChange(value: string) {
    const normalized = normalizeSymbol(value);
    setSelectedSymbol(normalized || "XAUUSD");
  }

  return (
    <main className="min-h-screen bg-[#070b12] px-3 py-3 text-slate-100 sm:px-4">
      <header className="mb-3 rounded-md border border-white/10 bg-[#111722] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img className="size-11 rounded-md border border-amber-300/25 bg-black object-cover" src="/star-gold-icon.png" alt="Star Gold By TSR" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-200">Graphique strategie intraday</p>
              <h1 className="text-xl font-black text-white">TradingView-like, moteur Star Gold</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]" href="/">
              Retour dashboard
            </Link>
          </div>
        </div>
      </header>

      <section className="mb-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-md border border-white/10 bg-[#121820] p-3">
          <div className="grid gap-3 md:grid-cols-[minmax(220px,340px)_1fr_1fr]">
            <SymbolPicker selectedSymbol={selectedSymbol} onChange={handleSymbolChange} />
            <Segmented label="Timeframe" options={strategyTimeframes} value={activeTimeframe} onChange={(value) => setActiveTimeframe(value as Timeframe)} />
            <Segmented
              label="Mode analyse"
              options={[
                { label: "Rapide", value: "fast" },
                { label: "Securise", value: "safe" },
                { label: "Mixte", value: "mixed" },
              ]}
              value={entryMode}
              onChange={(value) => setEntryMode(value as QuickEntryMode)}
            />
          </div>
        </div>
        <StrategyResultCard quick={quick} symbolProfile={symbolProfile} />
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <GoldChart
            candleMap={live.candleMap}
            connectionMessage={live.message}
            connectionSource={live.source}
            connectionStatus={live.status}
            executionSourceLabel={executionSourceLabel}
            fvg={activeAnalysis?.fvg ?? plan.fvg}
            lastTick={live.lastTick}
            orderBlock={activeAnalysis?.orderBlock ?? plan.orderBlock}
            orb={activeAnalysis?.orb ?? plan.orb}
            plan={plan}
            symbolProfile={symbolProfile}
            syncState={syncState}
            timeframe={activeTimeframe}
            onTimeframeChange={(timeframe) => strategyTimeframes.includes(timeframe) && setActiveTimeframe(timeframe)}
          />
        </div>

        <aside className="space-y-3">
          <StrategyDisplayPanel />
          <button
            className="flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-bold text-slate-100 transition hover:bg-white/[0.08]"
            type="button"
            onClick={() => setShowReasonPanel((value) => !value)}
          >
            {showReasonPanel ? <EyeOff size={16} /> : <Eye size={16} />}
            {showReasonPanel ? "Masquer raisons" : "Afficher raisons"}
          </button>
          {showReasonPanel && quick ? <ReasonPanel quick={quick} /> : null}
        </aside>
      </section>
    </main>
  );
}

function StrategyResultCard({ quick, symbolProfile }: { quick: ReturnType<typeof buildLiveTradePlan>["quickAnalysis"]; symbolProfile: SymbolProfile }) {
  const tone = quick?.signal === "BUY" ? "border-emerald-300/30 bg-emerald-300/10" : quick?.signal === "SELL" ? "border-rose-300/30 bg-rose-300/10" : "border-amber-300/30 bg-amber-300/10";

  return (
    <section className={`rounded-md border p-3 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-100">Resultat Strategie Intraday</p>
          <h2 className="mt-1 text-lg font-black text-white">{quick?.status ?? "Pas de trade"}</h2>
          <p className="mt-1 text-xs text-slate-300">{symbolProfile.symbol} - H1 contexte, M15 zone, M5 timing.</p>
        </div>
        <SignalBadge signal={quick?.signal ?? "WAIT"} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Metric label="Tendance H1" value={quick?.h1Trend ?? "Neutre"} />
        <Metric label="TF entree" value={quick?.entryTimeframe ?? "--"} />
        <Metric label="Zone entree" value={quick ? `${formatPrice(quick.entryZone.low)} - ${formatPrice(quick.entryZone.high)}` : "--"} />
        <Metric label="Entry Price" value={formatPrice(quick?.idealEntry)} />
        <Metric label="Stop Loss" value={formatPrice(quick?.stopLoss)} />
        <Metric label="Take Profit" value={formatPrice(quick?.takeProfit)} />
        <Metric label="Risk Reward" value={quick?.riskReward ? `1:${quick.riskReward.toFixed(2)}` : "--"} />
        <Metric label="Score" value={`${quick?.confidence ?? 0}%`} />
      </div>
    </section>
  );
}

function ReasonPanel({ quick }: { quick: NonNullable<ReturnType<typeof buildLiveTradePlan>["quickAnalysis"]> }) {
  return (
    <section className="rounded-md border border-white/10 bg-[#121820] p-3">
      <div className="mb-3 flex items-center gap-2 text-amber-100">
        <CheckCircle2 size={17} />
        <h3 className="font-black">Confirmations et raisons</h3>
      </div>
      <div className="space-y-3 text-xs leading-5">
        <div>
          <p className="mb-1 font-bold uppercase tracking-[0.14em] text-emerald-200">Valide</p>
          {quick.reasons.length ? quick.reasons.map((reason) => <p key={reason}>- {reason}</p>) : <p>- Aucune confirmation suffisante.</p>}
        </div>
        <div>
          <p className="mb-1 font-bold uppercase tracking-[0.14em] text-amber-200">A attendre</p>
          {quick.missing.length ? quick.missing.map((item) => <p key={item}>- {item}</p>) : <p>- Dernier check manuel execution, spread et risque.</p>}
        </div>
      </div>
    </section>
  );
}

function StrategyDisplayPanel() {
  const [settings, setSettings] = useState<Record<StrategyDisplayKey, boolean>>(() =>
    strategyDisplayItems.reduce((state, item) => ({ ...state, [item.key]: item.defaultChecked }), {} as Record<StrategyDisplayKey, boolean>),
  );

  function dispatch(command: StrategyDisplayCommand) {
    window.dispatchEvent(new CustomEvent("tradetsr-strategy-display", { detail: command }));
  }

  function applyPreset(action: "all" | "essentials" | "hide" | "reset") {
    const next = strategyDisplayItems.reduce((state, item) => {
      const checked =
        action === "all"
          ? true
          : action === "hide"
            ? false
            : action === "reset"
              ? item.defaultChecked
              : item.essential;
      return { ...state, [item.key]: checked };
    }, {} as Record<StrategyDisplayKey, boolean>);
    setSettings(next);
    dispatch({ action });
  }

  function toggle(item: StrategyDisplayItem, checked: boolean) {
    setSettings((current) => ({ ...current, [item.key]: checked }));
    dispatch({ action: "toggle", key: item.chartKey, value: checked });
  }

  return (
    <section className="rounded-md border border-white/10 bg-[#121820] p-3">
      <div className="mb-3 flex items-center gap-2 text-sky-100">
        <Layers3 size={17} />
        <h3 className="font-black">Affichage strategie</h3>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-1">
        <SmallAction icon={<Target size={14} />} label="Essentiels" onClick={() => applyPreset("essentials")} />
        <SmallAction icon={<Eye size={14} />} label="Tout afficher" onClick={() => applyPreset("all")} />
        <SmallAction icon={<EyeOff size={14} />} label="Tout cacher" onClick={() => applyPreset("hide")} />
        <SmallAction icon={<Gauge size={14} />} label="Reset" onClick={() => applyPreset("reset")} />
      </div>
      <div className="space-y-1.5">
        {strategyDisplayItems.map((item) => (
          <label key={item.key} className="flex items-center gap-2 rounded border border-white/10 bg-black/20 px-2 py-1.5 text-xs text-slate-200">
            <input className="size-4 accent-amber-300" type="checkbox" checked={settings[item.key]} onChange={(event) => toggle(item, event.target.checked)} />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
      <p className="mt-3 rounded border border-amber-300/20 bg-amber-300/10 px-2 py-2 text-xs leading-5 text-amber-50">
        Cacher un element ne le retire pas du calcul interne du moteur intraday.
      </p>
    </section>
  );
}

function SymbolPicker({ onChange, selectedSymbol }: { onChange: (symbol: string) => void; selectedSymbol: string }) {
  const grouped = useMemo(() => getSymbolsByCategory(), []);
  const symbols = useMemo(() => Object.values(grouped).flat().filter(Boolean) as SymbolProfile[], [grouped]);

  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Symbole</span>
      <input
        className="mt-2 h-10 w-full rounded-md border border-white/10 bg-black/35 px-3 font-mono text-sm font-black text-white outline-none focus:border-amber-300/50"
        list="strategy-symbols"
        value={selectedSymbol}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id="strategy-symbols">
        {symbols.map((symbol) => (
          <option key={symbol.symbol} value={symbol.symbol}>
            {symbol.label}
          </option>
        ))}
      </datalist>
    </label>
  );
}

function Segmented({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: Array<string | { label: string; value: string }>; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <div className="mt-2 grid grid-cols-3 gap-1 rounded-md border border-white/10 bg-black/25 p-1">
        {options.map((option) => {
          const item = typeof option === "string" ? { label: option, value: option } : option;
          const active = item.value === value;
          return (
            <button
              key={item.value}
              className={`rounded px-2 py-2 text-xs font-bold transition ${active ? "bg-amber-300 text-black" : "text-slate-300 hover:bg-white/[0.07]"}`}
              type="button"
              onClick={() => onChange(item.value)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/25 p-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-sm font-black text-white">{value}</p>
    </div>
  );
}

function SmallAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="inline-flex items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]" type="button" onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function isExnessSource(source: string | null) {
  return Boolean(source && source.toUpperCase().includes("MT5"));
}

function formatPrice(price?: number) {
  return price && Number.isFinite(price) ? price.toFixed(2) : "--";
}

type StrategyChartDisplayKey =
  | "showBos"
  | "showBuySellSignal"
  | "showChoch"
  | "showCrtLevels"
  | "showEntryZone"
  | "showFibonacci"
  | "showHhHl"
  | "showLiquidityLevels"
  | "showMarketStructure"
  | "showOrderBlocksH1"
  | "showOrderBlocksM15"
  | "showQuickAnalysisSummary"
  | "showRejectionZones"
  | "showRiskRewardBox"
  | "showRsi"
  | "showStopLoss"
  | "showTakeProfit"
  | "showTrendline";

type StrategyDisplayKey =
  | "bos"
  | "buySellSignal"
  | "choch"
  | "crt"
  | "entryZone"
  | "fibonacci"
  | "hhhl"
  | "liquidity"
  | "marketStructure"
  | "orderBlocksH1"
  | "orderBlocksM15"
  | "quickSummary"
  | "rejectionZones"
  | "riskReward"
  | "rsi"
  | "stopLoss"
  | "takeProfit"
  | "trendline";

interface StrategyDisplayItem {
  chartKey: StrategyChartDisplayKey;
  defaultChecked: boolean;
  essential: boolean;
  key: StrategyDisplayKey;
  label: string;
}

type StrategyDisplayCommand =
  | { action: "all" | "essentials" | "hide" | "reset" }
  | { action: "toggle"; key: StrategyChartDisplayKey; value: boolean };

const strategyDisplayItems: StrategyDisplayItem[] = [
  { chartKey: "showOrderBlocksH1", defaultChecked: true, essential: true, key: "orderBlocksH1", label: "Order Blocks H1" },
  { chartKey: "showOrderBlocksM15", defaultChecked: true, essential: false, key: "orderBlocksM15", label: "Order Blocks M15" },
  { chartKey: "showHhHl", defaultChecked: false, essential: false, key: "hhhl", label: "Structure HH / HL / LH / LL" },
  { chartKey: "showBos", defaultChecked: true, essential: false, key: "bos", label: "BOS" },
  { chartKey: "showChoch", defaultChecked: true, essential: false, key: "choch", label: "ChoCH" },
  { chartKey: "showTrendline", defaultChecked: false, essential: false, key: "trendline", label: "Trendlines" },
  { chartKey: "showFibonacci", defaultChecked: false, essential: false, key: "fibonacci", label: "Fibonacci" },
  { chartKey: "showRsi", defaultChecked: true, essential: false, key: "rsi", label: "RSI" },
  { chartKey: "showCrtLevels", defaultChecked: false, essential: false, key: "crt", label: "CRT Levels" },
  { chartKey: "showLiquidityLevels", defaultChecked: false, essential: false, key: "liquidity", label: "Zones de liquidite" },
  { chartKey: "showRejectionZones", defaultChecked: true, essential: false, key: "rejectionZones", label: "Zones de rejet" },
  { chartKey: "showEntryZone", defaultChecked: true, essential: true, key: "entryZone", label: "Entry Zone / Entry Price" },
  { chartKey: "showStopLoss", defaultChecked: true, essential: true, key: "stopLoss", label: "Stop Loss" },
  { chartKey: "showTakeProfit", defaultChecked: true, essential: true, key: "takeProfit", label: "Take Profit" },
  { chartKey: "showRiskRewardBox", defaultChecked: true, essential: true, key: "riskReward", label: "Risk Reward" },
  { chartKey: "showBuySellSignal", defaultChecked: true, essential: true, key: "buySellSignal", label: "Signal BUY / SELL / WAIT" },
  { chartKey: "showQuickAnalysisSummary", defaultChecked: true, essential: true, key: "quickSummary", label: "Resume strategie" },
  { chartKey: "showMarketStructure", defaultChecked: true, essential: false, key: "marketStructure", label: "Score et raisons du signal" },
];
