"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, Crosshair, Gauge, Minus, Plus, RotateCcw, Settings2, ShieldAlert, Target, Wifi, WifiOff, Zap } from "lucide-react";
import {
  CandlestickSeries,
  ColorType,
  LineStyle,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, LiveConnectionStatus, MarketTick, OrderBlockZone, Timeframe, TradePlan } from "@/types";
import { timeframes } from "@/lib/market/timeframes";

const defaultDisplaySettings: ChartDisplaySettings = {
  showTicker: true,
  showOhlc: true,
  showQuickTimeframes: true,
  showBidPriceLine: true,
  showAskPriceLine: false,
  showLastPriceLine: false,
  showPeriodSeparators: false,
  showGrid: true,
  showTradeLevels: false,
  showOrderBlocks: true,
  showLiquidityLevels: false,
  showLegend: false,
  showEmptyHelper: true,
};

export function GoldChart({
  candleMap,
  connectionMessage,
  connectionStatus,
  lastTick,
  orderBlock,
  onTimeframeChange,
  plan,
  timeframe,
}: {
  candleMap: Record<Timeframe, Candle[]>;
  connectionMessage: string;
  connectionStatus: LiveConnectionStatus;
  lastTick: MarketTick | null;
  orderBlock?: OrderBlockZone | null;
  onTimeframeChange: (timeframe: Timeframe) => void;
  plan: TradePlan;
  timeframe: Timeframe;
}) {
  const candles = candleMap[timeframe];
  const [ohlc, setOhlc] = useState<Candle | null>(candles.at(-1) ?? null);
  const [orderBlockOverlay, setOrderBlockOverlay] = useState<OrderBlockOverlay | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [displaySettings, setDisplaySettings] = useState<ChartDisplaySettings>(() => {
    if (typeof window === "undefined") {
      return defaultDisplaySettings;
    }

    try {
      const saved = window.localStorage.getItem("tradetsr-chart-display");
      return saved ? { ...defaultDisplaySettings, ...JSON.parse(saved) } : defaultDisplaySettings;
    } catch {
      return defaultDisplaySettings;
    }
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLineRefs = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[]>([]);
  const previousTimeframeRef = useRef<Timeframe | null>(null);
  const previousLengthRef = useRef(0);
  const latestCandleRef = useRef<Candle | null>(null);

  const latestCandle = candles.at(-1) ?? null;
  latestCandleRef.current = latestCandle;
  const lastPrice = lastTick?.price ?? latestCandle?.close ?? 0;
  const chartData = useMemo<CandlestickData[]>(
    () =>
      candles.map((candle) => ({
        time: candle.time as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    [candles],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const chart = createChart(container, {
      autoSize: true,
      height: 380,
      layout: {
        background: { type: ColorType.Solid, color: "#06080c" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "rgba(75, 85, 99, 0.22)" },
        horzLines: { color: "rgba(75, 85, 99, 0.22)" },
      },
      crosshair: {
        mode: 0,
      },
      localization: {
        priceFormatter: (price: number) => price.toFixed(2),
      },
      rightPriceScale: {
        borderColor: "rgba(148, 163, 184, 0.18)",
        scaleMargins: { top: 0.08, bottom: 0.14 },
      },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.18)",
        rightOffset: 8,
        barSpacing: 9,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a",
      downColor: "#dc2626",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#86efac",
      wickDownColor: "#fca5a5",
    });

    chart.subscribeCrosshairMove((param) => {
      const item = param.seriesData.get(series) as CandlestickData | undefined;
      if (!item || typeof item.time !== "number") {
        setOhlc(latestCandleRef.current);
        return;
      }

      setOhlc({
        time: item.time,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: 0,
      });
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) {
      return;
    }

    const timeframeChanged = previousTimeframeRef.current !== timeframe;
    const historyReplaced = candles.length > previousLengthRef.current + 1;

    if (timeframeChanged || historyReplaced || previousLengthRef.current === 0) {
      series.setData(chartData);
      chart.timeScale().fitContent();
    } else if (latestCandle) {
      series.update({
        time: latestCandle.time as UTCTimestamp,
        open: latestCandle.open,
        high: latestCandle.high,
        low: latestCandle.low,
        close: latestCandle.close,
      });
    }

    previousTimeframeRef.current = timeframe;
    previousLengthRef.current = candles.length;
    setOhlc(latestCandle);
  }, [candles.length, chartData, latestCandle, timeframe]);

  useEffect(() => {
    window.localStorage.setItem("tradetsr-chart-display", JSON.stringify(displaySettings));
  }, [displaySettings]);

  useEffect(() => {
    chartRef.current?.applyOptions({
      grid: {
        vertLines: { color: displaySettings.showGrid || displaySettings.showPeriodSeparators ? "rgba(75, 85, 99, 0.22)" : "transparent" },
        horzLines: { color: displaySettings.showGrid ? "rgba(75, 85, 99, 0.22)" : "transparent" },
      },
    });
  }, [displaySettings.showGrid, displaySettings.showPeriodSeparators]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) {
      return;
    }

    for (const line of priceLineRefs.current) {
      series.removePriceLine(line);
    }
    priceLineRefs.current = [];

    const activeOrderBlock = orderBlock ?? plan.orderBlock;

    if (displaySettings.showBidPriceLine) {
      addPriceLine(series, priceLineRefs.current, lastTick?.bid ?? 0, "#38bdf8", "Bid");
    }

    if (displaySettings.showAskPriceLine) {
      addPriceLine(series, priceLineRefs.current, lastTick?.ask ?? 0, "#f97316", "Ask");
    }

    if (displaySettings.showLastPriceLine) {
      addPriceLine(series, priceLineRefs.current, lastPrice, "#eab308", "Last");
    }

    if (displaySettings.showTradeLevels) {
      addPriceLine(series, priceLineRefs.current, plan.entry, "#facc15", "Entry");
      addPriceLine(series, priceLineRefs.current, plan.stopLoss, "#fb7185", "SL");
      plan.takeProfits.forEach((target, index) => addPriceLine(series, priceLineRefs.current, target, "#34d399", `TP${index + 1}`));
    }

    if (displaySettings.showOrderBlocks && activeOrderBlock) {
      const color = activeOrderBlock.direction === "bullish" ? "#22c55e" : "#ef4444";
      addPriceLine(series, priceLineRefs.current, activeOrderBlock.high, color, `OB ${activeOrderBlock.score}/100`);
      addPriceLine(series, priceLineRefs.current, activeOrderBlock.low, color, activeOrderBlock.strength);
    }

    if (displaySettings.showLiquidityLevels && candles.length) {
      addPriceLine(series, priceLineRefs.current, Math.min(...candles.slice(-160).map((candle) => candle.low)), "#38bdf8", "Support");
      addPriceLine(series, priceLineRefs.current, Math.max(...candles.slice(-160).map((candle) => candle.high)), "#f59e0b", "Resistance");
    }
  }, [candles, displaySettings, lastPrice, lastTick?.ask, lastTick?.bid, orderBlock, plan.entry, plan.orderBlock, plan.stopLoss, plan.takeProfits]);

  useEffect(() => {
    const activeOrderBlock = orderBlock ?? plan.orderBlock;
    const series = seriesRef.current;

    if (!series || !activeOrderBlock || !displaySettings.showOrderBlocks) {
      setOrderBlockOverlay(null);
      return;
    }

    const updateOverlay = () => {
      const high = series.priceToCoordinate(activeOrderBlock.high);
      const low = series.priceToCoordinate(activeOrderBlock.low);

      if (high === null || low === null) {
        setOrderBlockOverlay(null);
        return;
      }

      const bullish = activeOrderBlock.direction === "bullish";

      setOrderBlockOverlay({
        top: Math.min(high, low),
        height: Math.max(4, Math.abs(low - high)),
        background: bullish ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
        border: bullish ? "rgba(34, 197, 94, 0.55)" : "rgba(239, 68, 68, 0.55)",
        label: `${bullish ? "Bullish" : "Bearish"} OB ${activeOrderBlock.score}/100 - ${activeOrderBlock.strength}`,
      });
    };

    updateOverlay();
    chartRef.current?.subscribeCrosshairMove(updateOverlay);

    return () => {
      chartRef.current?.unsubscribeCrosshairMove(updateOverlay);
    };
  }, [candles.length, displaySettings.showOrderBlocks, orderBlock, plan.orderBlock, timeframe]);

  function zoom(factor: number) {
    const timeScale = chartRef.current?.timeScale();
    const range = timeScale?.getVisibleLogicalRange();
    if (!timeScale || !range) {
      return;
    }

    const center = (range.from + range.to) / 2;
    const width = Math.max(8, (range.to - range.from) * factor);
    timeScale.setVisibleLogicalRange({ from: center - width / 2, to: center + width / 2 });
  }

  return (
    <section className="relative rounded-md border border-white/10 bg-[#171717] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        {displaySettings.showTicker ? (
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-md bg-amber-300/10 text-amber-200">
              {connectionStatus === "live" ? <Wifi size={18} /> : <WifiOff size={18} />}
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">XAUUSD live chart</h2>
              <p className="text-xs text-slate-400">{connectionMessage}</p>
            </div>
          </div>
        ) : (
          <div />
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {displaySettings.showQuickTimeframes
            ? timeframes.map((item) => (
                <button
                  key={item}
                  className={`h-8 rounded border px-2.5 text-xs font-semibold ${
                    timeframe === item ? "border-amber-300/50 bg-amber-300/15 text-amber-100" : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]"
                  }`}
                  type="button"
                  onClick={() => onTimeframeChange(item)}
                >
                  {item}
                </button>
              ))
            : null}
          <div className="relative">
            <IconButton label="Options d'affichage" onClick={() => setSettingsOpen((value) => !value)}>
              <Settings2 size={16} />
            </IconButton>
            {settingsOpen ? <DisplaySettingsPanel settings={displaySettings} onChange={setDisplaySettings} onClose={() => setSettingsOpen(false)} /> : null}
          </div>
        </div>
      </div>

      {displaySettings.showOhlc ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/10 bg-black/30 px-3 py-2">
        <div className="flex flex-wrap gap-3 font-mono text-xs text-slate-300">
          <span>O {formatPrice(ohlc?.open)}</span>
          <span>H {formatPrice(ohlc?.high)}</span>
          <span>L {formatPrice(ohlc?.low)}</span>
          <span>C {formatPrice(ohlc?.close)}</span>
          <span>{ohlc ? new Date(ohlc.time * 1000).toLocaleString("fr-FR", { hour12: false }) : "en attente tick"}</span>
        </div>
        <div className="flex items-center gap-1">
          <IconButton label="Zoom arrière" onClick={() => zoom(1.25)}>
            <Minus size={16} />
          </IconButton>
          <IconButton label="Zoom avant" onClick={() => zoom(0.8)}>
            <Plus size={16} />
          </IconButton>
          <IconButton label="Reset" onClick={() => chartRef.current?.timeScale().fitContent()}>
            <RotateCcw size={16} />
          </IconButton>
          <IconButton label="Dernière bougie" onClick={() => chartRef.current?.timeScale().scrollToRealTime()}>
            <Crosshair size={16} />
          </IconButton>
        </div>
      </div>
      ) : null}

      <div className="relative mt-3 h-[380px] w-full overflow-hidden rounded-md border border-white/10 bg-[#06080c]">
        <div ref={containerRef} className="h-full w-full" />
        {orderBlockOverlay ? (
          <div
            className="pointer-events-none absolute inset-x-0 z-10 border-y"
            style={{
              top: orderBlockOverlay.top,
              height: orderBlockOverlay.height,
              background: orderBlockOverlay.background,
              borderColor: orderBlockOverlay.border,
            }}
          >
            <span
              className="absolute right-2 top-1 rounded px-2 py-0.5 font-mono text-[10px] font-semibold text-white shadow-lg"
              style={{ background: orderBlockOverlay.border }}
            >
              {orderBlockOverlay.label}
            </span>
          </div>
        ) : null}
        {!candles.length && displaySettings.showEmptyHelper ? <ChartEmptyState connectionMessage={connectionMessage} connectionStatus={connectionStatus} plan={plan} timeframe={timeframe} /> : null}
      </div>

      {displaySettings.showLegend ? (
      <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-5">
        <Legend color="bg-sky-400" label="Support live" />
        <Legend color="bg-amber-400" label="Resistance / liquidité" />
        <Legend color={(orderBlock ?? plan.orderBlock)?.direction === "bearish" ? "bg-red-400" : "bg-green-400"} label="Order Block zone" />
        <Legend color="bg-rose-400" label="Stop loss" />
        <Legend color="bg-emerald-400" label="Take profits" />
      </div>
      ) : null}
    </section>
  );
}

function DisplaySettingsPanel({
  onChange,
  onClose,
  settings,
}: {
  onChange: (settings: ChartDisplaySettings) => void;
  onClose: () => void;
  settings: ChartDisplaySettings;
}) {
  function update(key: keyof ChartDisplaySettings, value: boolean) {
    onChange({ ...settings, [key]: value });
  }

  return (
    <div className="absolute right-0 top-10 z-30 w-72 rounded-md border border-white/15 bg-[#101419] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-white/10 pb-2">
        <div>
          <p className="text-sm font-semibold text-white">Affichage</p>
          <p className="text-[11px] text-slate-500">Choisis ce qui reste visible sur le chart.</p>
        </div>
        <button className="text-xs text-slate-400 transition hover:text-white" type="button" onClick={onClose}>
          Fermer
        </button>
      </div>

      <div className="grid gap-1.5 text-sm text-slate-200">
        <DisplayToggle checked={settings.showTicker} label="Show ticker" onChange={(value) => update("showTicker", value)} />
        <DisplayToggle checked={settings.showOhlc} label="Show OHLC" onChange={(value) => update("showOhlc", value)} />
        <DisplayToggle checked={settings.showQuickTimeframes} label="Show quick timeframe buttons" onChange={(value) => update("showQuickTimeframes", value)} />
        <DisplayToggle checked={settings.showBidPriceLine} label="Show bid price line" onChange={(value) => update("showBidPriceLine", value)} />
        <DisplayToggle checked={settings.showAskPriceLine} label="Show ask price line" onChange={(value) => update("showAskPriceLine", value)} />
        <DisplayToggle checked={settings.showLastPriceLine} label="Show last price line" onChange={(value) => update("showLastPriceLine", value)} />
        <DisplayToggle checked={settings.showPeriodSeparators} label="Show period separators" onChange={(value) => update("showPeriodSeparators", value)} />
        <DisplayToggle checked={settings.showGrid} label="Show grid" onChange={(value) => update("showGrid", value)} />
        <DisplayToggle checked={settings.showLiquidityLevels} label="Show liquidity/support levels" onChange={(value) => update("showLiquidityLevels", value)} />
        <DisplayToggle checked={settings.showOrderBlocks} label="Show order block zones" onChange={(value) => update("showOrderBlocks", value)} />
        <DisplayToggle checked={settings.showTradeLevels} label="Show trade levels" onChange={(value) => update("showTradeLevels", value)} />
        <DisplayToggle checked={settings.showLegend} label="Show object descriptions" onChange={(value) => update("showLegend", value)} />
        <DisplayToggle checked={settings.showEmptyHelper} label="Show empty chart helper" onChange={(value) => update("showEmptyHelper", value)} />
      </div>

      <button
        className="mt-3 w-full rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]"
        type="button"
        onClick={() => onChange(defaultDisplaySettings)}
      >
        Reset affichage
      </button>
    </div>
  );
}

function DisplayToggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 transition hover:bg-white/[0.04]">
      <input className="size-4 accent-amber-300" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function ChartEmptyState({
  connectionMessage,
  connectionStatus,
  plan,
  timeframe,
}: {
  connectionMessage: string;
  connectionStatus: LiveConnectionStatus;
  plan: TradePlan;
  timeframe: Timeframe;
}) {
  const live = connectionStatus === "live";

  return (
    <div className="absolute inset-0 z-20 bg-[#06080c] p-3">
      <div className="grid h-full gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-h-0 flex-col justify-between rounded-md border border-white/10 bg-[#0b1017] p-4">
          <div>
            <div className="flex items-center gap-3">
              <div className={`grid size-10 place-items-center rounded-md ${live ? "bg-emerald-300/10 text-emerald-200" : "bg-amber-300/10 text-amber-200"}`}>
                {live ? <Wifi size={18} /> : <WifiOff size={18} />}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Graphique {timeframe} en attente de bougies live</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">{connectionMessage}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <EmptyStep icon={<Wifi size={16} />} label="1. Bridge MT5" value="Lance Star Gold Bridge sur XAUUSD" />
              <EmptyStep icon={<Target size={16} />} label="2. Timeframe" value="Choisis M1, M5 ou M15 pour scalp" />
              <EmptyStep icon={<Gauge size={16} />} label="3. Donnees" value="Attends les premieres bougies broker" />
              <EmptyStep icon={<ShieldAlert size={16} />} label="4. Risque" value="Aucun signal sans confirmation live" />
            </div>
          </div>

          <div className="mt-4 rounded-md border border-amber-300/20 bg-amber-300/10 p-3">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 shrink-0 text-amber-200" size={18} />
              <p className="text-sm leading-6 text-amber-100">
                Le chart n'affiche pas de zone vide: il attend un flux MT5 exploitable avant de dessiner les bougies, les Order Blocks et la liquidite.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-white/10 bg-black/30 p-3">
          <div className="flex items-center gap-2 text-amber-100">
            <Zap size={17} />
            <p className="text-sm font-semibold">Scalping M1/M5/M15</p>
          </div>
          <div className="mt-4 space-y-2 text-xs">
            <ScalpStatus label="Mode actif" value={plan.signalMode === "scalping" ? "Scalping" : "Conservative"} active={plan.signalMode === "scalping"} />
            <ScalpStatus label="Signal" value={plan.decision} active={plan.decision !== "WAIT"} />
            <ScalpStatus label="Confiance" value={`${plan.score}/100`} active={plan.score >= 60} />
            <ScalpStatus label="Alerte" value={plan.waitReason} active={plan.decision !== "WAIT"} />
          </div>
          <p className="mt-4 rounded-md border border-red-300/20 bg-red-300/10 p-3 text-xs leading-5 text-red-100">
            Scalping has higher risk and requires strict stop loss.
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyStep({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/25 p-3">
      <div className="flex items-center gap-2 text-slate-300">
        {icon}
        <p className="text-xs font-semibold">{label}</p>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">{value}</p>
    </div>
  );
}

function ScalpStatus({ active, label, value }: { active: boolean; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-black/30 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className={`truncate text-right font-mono font-semibold ${active ? "text-emerald-300" : "text-slate-300"}`}>{value}</span>
    </div>
  );
}

function addPriceLine(
  series: ISeriesApi<"Candlestick">,
  refs: ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[],
  price: number,
  color: string,
  title: string,
) {
  if (!Number.isFinite(price) || price <= 0) {
    return;
  }

  refs.push(
    series.createPriceLine({
      price,
      color,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title,
    }),
  );
}

interface OrderBlockOverlay {
  top: number;
  height: number;
  background: string;
  border: string;
  label: string;
}

interface ChartDisplaySettings {
  showTicker: boolean;
  showOhlc: boolean;
  showQuickTimeframes: boolean;
  showBidPriceLine: boolean;
  showAskPriceLine: boolean;
  showLastPriceLine: boolean;
  showPeriodSeparators: boolean;
  showGrid: boolean;
  showTradeLevels: boolean;
  showOrderBlocks: boolean;
  showLiquidityLevels: boolean;
  showLegend: boolean;
  showEmptyHelper: boolean;
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      className="grid size-8 place-items-center rounded border border-white/10 bg-white/[0.04] text-slate-200 transition hover:bg-white/[0.08]"
      title={label}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-black/30 px-3 py-2">
      <span className={`size-2 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  );
}

function formatPrice(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "--";
}
