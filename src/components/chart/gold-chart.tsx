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
  type Logical,
  type LogicalRange,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, FvgAnalysis, LiveConnectionStatus, MarketTick, OrbAnalysis, OrderBlockZone, Timeframe, TradePlan } from "@/types";
import { calculateRSI } from "@/lib/indicators";
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
  showRsi: true,
  showOrb: true,
  showFvg: true,
  showRiskRewardBox: true,
  showLegend: false,
  showEmptyHelper: true,
};

const RIGHT_PADDING_BARS = 16;
const MIN_VISIBLE_BARS = 24;
const DEFAULT_VISIBLE_BARS = 95;

export function GoldChart({
  candleMap,
  connectionMessage,
  connectionStatus,
  lastTick,
  orderBlock,
  fvg,
  orb,
  onTimeframeChange,
  plan,
  timeframe,
}: {
  candleMap: Record<Timeframe, Candle[]>;
  connectionMessage: string;
  connectionStatus: LiveConnectionStatus;
  lastTick: MarketTick | null;
  orderBlock?: OrderBlockZone | null;
  fvg?: FvgAnalysis | null;
  orb?: OrbAnalysis | null;
  onTimeframeChange: (timeframe: Timeframe) => void;
  plan: TradePlan;
  timeframe: Timeframe;
}) {
  const candles = candleMap[timeframe];
  const [ohlc, setOhlc] = useState<Candle | null>(candles.at(-1) ?? null);
  const [orderBlockOverlay, setOrderBlockOverlay] = useState<OrderBlockOverlay | null>(null);
  const [fvgOverlay, setFvgOverlay] = useState<OrderBlockOverlay | null>(null);
  const [riskRewardOverlay, setRiskRewardOverlay] = useState<RiskRewardOverlay | null>(null);
  const [riskRewardNotice, setRiskRewardNotice] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoFollow, setAutoFollow] = useState(true);
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
  const autoFollowRef = useRef(true);
  const suppressRangeChangeRef = useRef(false);
  const userRangeReadyRef = useRef(false);
  const pointerScrollRef = useRef(false);
  const wheelScrollLeftRef = useRef(false);

  const latestCandle = candles.at(-1) ?? null;
  latestCandleRef.current = latestCandle;
  const lastPrice = lastTick?.price ?? latestCandle?.close ?? 0;
  const rsiSeries = useMemo(() => calculateRsiSeries(candles.map((candle) => candle.close)), [candles]);
  const currentRsi = useMemo(() => Number(calculateRSI(candles.map((candle) => candle.close)).toFixed(1)), [candles]);
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
        autoScale: true,
        borderColor: "rgba(148, 163, 184, 0.18)",
        scaleMargins: { top: 0.08, bottom: 0.14 },
      },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.18)",
        rightOffset: RIGHT_PADDING_BARS,
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

    const markPointerScroll = () => {
      pointerScrollRef.current = true;
    };
    const clearPointerScroll = () => {
      window.setTimeout(() => {
        pointerScrollRef.current = false;
      }, 180);
    };
    const markWheelScroll = (event: WheelEvent) => {
      if (event.deltaX < -1) {
        wheelScrollLeftRef.current = true;
        window.setTimeout(() => {
          wheelScrollLeftRef.current = false;
        }, 220);
      }
    };

    container.addEventListener("pointerdown", markPointerScroll);
    window.addEventListener("pointerup", clearPointerScroll);
    container.addEventListener("wheel", markWheelScroll, { passive: true });

    return () => {
      container.removeEventListener("pointerdown", markPointerScroll);
      window.removeEventListener("pointerup", clearPointerScroll);
      container.removeEventListener("wheel", markWheelScroll);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    autoFollowRef.current = autoFollow;
  }, [autoFollow]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    const handleVisibleRangeChange = (range: LogicalRange | null) => {
      if (!range || suppressRangeChangeRef.current || !userRangeReadyRef.current || !latestCandleRef.current) {
        return;
      }

      const latestIndex = Math.max(0, previousLengthRef.current - 1);
      const viewingHistory = range.to < latestIndex + 1;

      if (viewingHistory && autoFollowRef.current) {
        if (pointerScrollRef.current || wheelScrollLeftRef.current) {
          setAutoFollow(false);
          return;
        }

        keepLatestCandleVisible(false);
      }
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
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
    const shouldFollow = autoFollowRef.current || timeframeChanged || previousLengthRef.current === 0;

    if (timeframeChanged || historyReplaced || previousLengthRef.current === 0) {
      series.setData(chartData);
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

    if (timeframeChanged) {
      setAutoFollow(true);
    }

    if (candles.length && shouldFollow) {
      keepLatestCandleVisible(timeframeChanged || historyReplaced);
    }
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

    if (displaySettings.showRiskRewardBox && plan.decision !== "WAIT") {
      addPriceLine(series, priceLineRefs.current, plan.entry, "#fde047", "RR Entry");
      addPriceLine(series, priceLineRefs.current, plan.stopLoss, "#fb7185", "RR SL");
      addPriceLine(series, priceLineRefs.current, plan.takeProfits[0], "#34d399", "RR TP1");
      addPriceLine(series, priceLineRefs.current, plan.takeProfits[1], "#22c55e", "RR TP2");
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

    if (displaySettings.showOrb && orb) {
      addPriceLine(series, priceLineRefs.current, orb.high, "#facc15", `${orb.session} ORB H`);
      addPriceLine(series, priceLineRefs.current, orb.low, "#facc15", `${orb.session} ORB L`);
    }

    if (displaySettings.showFvg && fvg) {
      const color = fvg.direction === "bullish" ? "#22c55e" : "#ef4444";
      addPriceLine(series, priceLineRefs.current, fvg.high, color, `FVG ${fvg.score}/100`);
      addPriceLine(series, priceLineRefs.current, fvg.low, color, `${fvg.fillPercent}% fill`);
    }
  }, [candles, displaySettings, fvg, lastPrice, lastTick?.ask, lastTick?.bid, orb, orderBlock, plan.decision, plan.entry, plan.orderBlock, plan.stopLoss, plan.takeProfits]);

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

  useEffect(() => {
    const series = seriesRef.current;

    if (!series || !fvg || !displaySettings.showFvg) {
      setFvgOverlay(null);
      return;
    }

    const high = series.priceToCoordinate(fvg.high);
    const low = series.priceToCoordinate(fvg.low);

    if (high === null || low === null) {
      setFvgOverlay(null);
      return;
    }

    const bullish = fvg.direction === "bullish";
    setFvgOverlay({
      top: Math.min(high, low),
      height: Math.max(4, Math.abs(low - high)),
      background: bullish ? "rgba(34, 197, 94, 0.10)" : "rgba(239, 68, 68, 0.10)",
      border: bullish ? "rgba(34, 197, 94, 0.45)" : "rgba(239, 68, 68, 0.45)",
      label: `${bullish ? "Bullish" : "Bearish"} FVG ${fvg.score}/100 - ${fvg.fillPercent}% fill`,
    });
  }, [candles.length, displaySettings.showFvg, fvg, timeframe]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    const container = containerRef.current;

    if (!series || !chart || !container || !displaySettings.showRiskRewardBox) {
      setRiskRewardOverlay(null);
      setRiskRewardNotice(null);
      return;
    }

    const updateOverlay = () => {
      const overlay = buildRiskRewardOverlay({ containerHeight: container.clientHeight, containerWidth: container.clientWidth, plan, series });
      setRiskRewardOverlay(overlay);
      setRiskRewardNotice(overlay ? null : getRiskRewardNotice(plan));
    };

    updateOverlay();
    chart.subscribeCrosshairMove(updateOverlay);
    chart.timeScale().subscribeVisibleLogicalRangeChange(updateOverlay);

    return () => {
      chart.unsubscribeCrosshairMove(updateOverlay);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateOverlay);
    };
  }, [
    candles.length,
    displaySettings.showRiskRewardBox,
    plan.decision,
    plan.direction,
    plan.entry,
    plan.riskReward,
    plan.stopLoss,
    plan.takeProfits,
    timeframe,
  ]);

  function keepLatestCandleVisible(resetWidth = false) {
    const timeScale = chartRef.current?.timeScale();
    const range = timeScale?.getVisibleLogicalRange();
    if (!timeScale || !candles.length) {
      return;
    }

    const latestIndex = candles.length - 1;
    const currentWidth = range ? range.to - range.from : DEFAULT_VISIBLE_BARS;
    const width = Math.max(MIN_VISIBLE_BARS, resetWidth ? Math.min(DEFAULT_VISIBLE_BARS, Math.max(MIN_VISIBLE_BARS, candles.length + RIGHT_PADDING_BARS)) : currentWidth);
    const to = latestIndex + RIGHT_PADDING_BARS;

    setVisibleLogicalRange({ from: to - width, to });
  }

  function goToLatestCandle() {
    setAutoFollow(true);
    autoFollowRef.current = true;
    keepLatestCandleVisible(false);
  }

  function fitLatestContent() {
    setAutoFollow(true);
    autoFollowRef.current = true;
    keepLatestCandleVisible(true);
  }

  function setVisibleLogicalRange(range: { from: number; to: number }) {
    const timeScale = chartRef.current?.timeScale();
    if (!timeScale) {
      return;
    }

    suppressRangeChangeRef.current = true;
    timeScale.applyOptions({ rightOffset: RIGHT_PADDING_BARS });
    timeScale.setVisibleLogicalRange({ from: range.from as Logical, to: range.to as Logical });
    window.setTimeout(() => {
      suppressRangeChangeRef.current = false;
      userRangeReadyRef.current = true;
    }, 120);
  }

  function zoom(factor: number) {
    const timeScale = chartRef.current?.timeScale();
    const range = timeScale?.getVisibleLogicalRange();
    if (!timeScale || !range) {
      return;
    }

    const width = Math.max(MIN_VISIBLE_BARS, (range.to - range.from) * factor);

    if (autoFollowRef.current && candles.length) {
      const to = candles.length - 1 + RIGHT_PADDING_BARS;
      setVisibleLogicalRange({ from: to - width, to });
      return;
    }

    const center = (range.from + range.to) / 2;
    setVisibleLogicalRange({ from: center - width / 2, to: center + width / 2 });
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
          <IconButton label="Reset latest view" onClick={fitLatestContent}>
            <RotateCcw size={16} />
          </IconButton>
          <IconButton label="Go to latest candle" onClick={goToLatestCandle}>
            <Crosshair size={16} />
          </IconButton>
        </div>
      </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className={`rounded border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${autoFollow ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200" : "border-amber-300/25 bg-amber-300/10 text-amber-100"}`}>
          {autoFollow ? "Live follow ON" : "Viewing history"}
        </span>
        <button
          className="inline-flex h-8 items-center gap-2 rounded border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]"
          type="button"
          onClick={goToLatestCandle}
        >
          <Crosshair size={15} />
          Go to latest candle
        </button>
      </div>

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
        {fvgOverlay ? (
          <div
            className="pointer-events-none absolute inset-x-0 z-10 border-y"
            style={{
              top: fvgOverlay.top,
              height: fvgOverlay.height,
              background: fvgOverlay.background,
              borderColor: fvgOverlay.border,
            }}
          >
            <span
              className="absolute left-2 top-1 rounded px-2 py-0.5 font-mono text-[10px] font-semibold text-white shadow-lg"
              style={{ background: fvgOverlay.border }}
            >
              {fvgOverlay.label}
            </span>
          </div>
        ) : null}
        {riskRewardOverlay ? <RiskRewardBox overlay={riskRewardOverlay} /> : null}
        {!riskRewardOverlay && riskRewardNotice ? <RiskRewardNotice message={riskRewardNotice} /> : null}
        {!candles.length && displaySettings.showEmptyHelper ? <ChartEmptyState connectionMessage={connectionMessage} connectionStatus={connectionStatus} plan={plan} timeframe={timeframe} /> : null}
      </div>

      {displaySettings.showRsi ? <RsiPanel rsi={currentRsi} values={rsiSeries} /> : null}

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
        <DisplayToggle checked={settings.showRsi} label="Show RSI 14" onChange={(value) => update("showRsi", value)} />
        <DisplayToggle checked={settings.showOrb} label="Show ORB high/low" onChange={(value) => update("showOrb", value)} />
        <DisplayToggle checked={settings.showFvg} label="Show FVG zones" onChange={(value) => update("showFvg", value)} />
        <DisplayToggle checked={settings.showRiskRewardBox} label="Show Risk/Reward Box" onChange={(value) => update("showRiskRewardBox", value)} />
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

function RsiPanel({ rsi, values }: { rsi: number; values: number[] }) {
  const color = rsi >= 70 ? "#fb7185" : rsi <= 30 ? "#38bdf8" : rsi >= 55 ? "#34d399" : rsi <= 45 ? "#fbbf24" : "#cbd5e1";
  const state = rsi >= 70 ? "Surachat" : rsi <= 30 ? "Survente" : rsi >= 55 ? "Momentum haussier" : rsi <= 45 ? "Momentum faible" : "Neutre";
  const points = buildRsiPolyline(values.slice(-80), 760, 64);
  const latestX = `${Math.max(0, Math.min(100, rsi))}%`;

  return (
    <div className="mt-2 rounded-md border border-white/10 bg-black/25 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">RSI 14</span>
          <span className="font-mono text-sm font-bold text-white">{Number.isFinite(rsi) ? rsi.toFixed(1) : "--"}</span>
          <span className="rounded border px-2 py-0.5 text-[11px] font-semibold" style={{ borderColor: `${color}66`, color, backgroundColor: `${color}18` }}>
            {state}
          </span>
        </div>
        <div className="font-mono text-[11px] text-slate-500">70 / 50 / 30</div>
      </div>

      <div className="relative h-16 overflow-hidden rounded border border-white/10 bg-[#070b10]">
        <div className="absolute left-0 right-0 top-[30%] border-t border-rose-300/20" />
        <div className="absolute left-0 right-0 top-1/2 border-t border-slate-300/15" />
        <div className="absolute left-0 right-0 top-[70%] border-t border-sky-300/20" />
        <div className="absolute bottom-0 top-0 w-px bg-white/25" style={{ left: latestX }} />
        <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 760 64">
          <polyline fill="none" points={points} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </svg>
      </div>
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

function buildRiskRewardOverlay({
  containerHeight,
  containerWidth,
  plan,
  series,
}: {
  containerHeight: number;
  containerWidth: number;
  plan: TradePlan;
  series: ISeriesApi<"Candlestick">;
}): RiskRewardOverlay | null {
  if (plan.decision === "WAIT" || plan.direction === "Neutral") {
    return null;
  }

  const entry = plan.entry;
  const stopLoss = plan.stopLoss;
  const tp1 = plan.takeProfits[0];
  const tp2 = plan.takeProfits[1] || plan.takeProfits[0];
  const validPrices = [entry, stopLoss, tp1, tp2].every((price) => Number.isFinite(price) && price > 0);

  if (!validPrices) {
    return null;
  }

  const bullish = plan.direction === "Bullish";
  const entryY = series.priceToCoordinate(entry);
  const stopY = series.priceToCoordinate(stopLoss);
  const tp1Y = series.priceToCoordinate(tp1);
  const tp2Y = series.priceToCoordinate(tp2);

  if (entryY === null || stopY === null || tp1Y === null || tp2Y === null) {
    return null;
  }

  const coherent =
    bullish
      ? tp1 > entry && tp2 > entry && stopLoss < entry
      : tp1 < entry && tp2 < entry && stopLoss > entry;

  if (!coherent) {
    return null;
  }

  const compact = containerWidth < 560;
  const left = compact ? 30 : Math.max(48, Math.floor(containerWidth * 0.18));
  const width = compact ? Math.max(145, containerWidth - left - 54) : Math.max(210, Math.min(360, containerWidth * 0.42));
  const preview = plan.decision.includes("WATCH");
  const tpForRatio = Math.abs(tp1 - entry);
  const riskForRatio = Math.abs(entry - stopLoss);
  const rr = riskForRatio > 0 ? tpForRatio / riskForRatio : plan.riskReward;
  const profitTop = clampCoordinate(Math.min(entryY, tp2Y), containerHeight);
  const profitBottom = clampCoordinate(Math.max(entryY, tp2Y), containerHeight);
  const riskTop = clampCoordinate(Math.min(entryY, stopY), containerHeight);
  const riskBottom = clampCoordinate(Math.max(entryY, stopY), containerHeight);

  return {
    entry,
    entryY: clampCoordinate(entryY, containerHeight),
    left,
    preview,
    profit: {
      top: profitTop,
      height: Math.max(8, profitBottom - profitTop),
    },
    risk: {
      top: riskTop,
      height: Math.max(8, riskBottom - riskTop),
    },
    rr: Number(rr.toFixed(2)),
    sl: stopLoss,
    slY: clampCoordinate(stopY, containerHeight),
    tp1,
    tp1Y: clampCoordinate(tp1Y, containerHeight),
    tp2,
    tp2Y: clampCoordinate(tp2Y, containerHeight),
    width,
  };
}

function RiskRewardBox({ overlay }: { overlay: RiskRewardOverlay }) {
  const borderStyle = overlay.preview ? "border-dashed" : "border-solid";
  const panelClass = overlay.preview ? "opacity-85" : "opacity-100";

  return (
    <div className="pointer-events-none absolute inset-y-0 z-20" style={{ left: overlay.left, width: overlay.width }}>
      <div
        className={`absolute left-0 right-0 rounded-sm border-2 ${borderStyle} border-emerald-300/80 bg-emerald-300/24 ${panelClass}`}
        style={{ top: overlay.profit.top, height: overlay.profit.height }}
      />
      <div
        className={`absolute left-0 right-0 rounded-sm border-2 ${borderStyle} border-rose-300/80 bg-rose-300/24 ${panelClass}`}
        style={{ top: overlay.risk.top, height: overlay.risk.height }}
      />
      <RiskRewardLine color="bg-amber-200" label={`Entry ${formatPrice(overlay.entry)}`} top={overlay.entryY} />
      <RiskRewardLine color="bg-rose-300" label={`Stop Loss ${formatPrice(overlay.sl)}`} top={overlay.slY} />
      <RiskRewardLine color="bg-emerald-300" label={`TP1 ${formatPrice(overlay.tp1)}`} top={overlay.tp1Y} />
      <RiskRewardLine color="bg-emerald-400" label={`TP2 ${formatPrice(overlay.tp2)}`} top={overlay.tp2Y} />
      <span className="absolute right-1 rounded border border-white/10 bg-black/70 px-2 py-1 font-mono text-[10px] font-bold text-white shadow-lg" style={{ top: Math.max(4, overlay.profit.top - 26) }}>
        RR 1:{overlay.rr.toFixed(2)}
      </span>
      <span className="absolute left-1 top-2 rounded border border-white/10 bg-black/65 px-2 py-1 text-[10px] font-semibold text-slate-200 shadow-lg">
        Visual plan only
      </span>
      {overlay.preview ? (
        <span className="absolute left-1 rounded border border-amber-300/25 bg-black/70 px-2 py-1 text-[10px] font-semibold text-amber-100 shadow-lg" style={{ top: Math.max(4, overlay.risk.top + overlay.risk.height + 6) }}>
          Preview only
        </span>
      ) : null}
    </div>
  );
}

function RiskRewardNotice({ message }: { message: string }) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-20 max-w-[320px] rounded-md border border-amber-300/30 bg-black/75 px-3 py-2 shadow-lg">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">Risk/Reward Box</p>
      <p className="mt-1 text-xs leading-5 text-slate-100">{message}</p>
    </div>
  );
}

function getRiskRewardNotice(plan: TradePlan) {
  if (plan.decision === "WAIT" || plan.direction === "Neutral") {
    return "Masque: la decision finale est WAIT. Le RR box apparait seulement quand un plan WATCH ou SCALP READY existe.";
  }

  const validPrices = [plan.entry, plan.stopLoss, plan.takeProfits[0], plan.takeProfits[1]].every((price) => Number.isFinite(price) && price > 0);
  if (!validPrices) {
    return "Masque: entry, stop loss, TP1 ou TP2 manque dans le plan final.";
  }

  return "Masque: les niveaux du plan ne sont pas coherents avec le sens BUY/SELL.";
}

function clampCoordinate(value: number, height: number) {
  return Math.max(0, Math.min(height, value));
}

function RiskRewardLine({ color, label, top }: { color: string; label: string; top: number }) {
  return (
    <div className="absolute left-0 right-0" style={{ top }}>
      <div className={`h-px ${color}`} />
      <span className="absolute right-1 top-1 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white shadow-lg">{label}</span>
    </div>
  );
}

interface OrderBlockOverlay {
  top: number;
  height: number;
  background: string;
  border: string;
  label: string;
}

interface RiskRewardOverlay {
  entry: number;
  entryY: number;
  left: number;
  preview: boolean;
  profit: { top: number; height: number };
  risk: { top: number; height: number };
  rr: number;
  sl: number;
  slY: number;
  tp1: number;
  tp1Y: number;
  tp2: number;
  tp2Y: number;
  width: number;
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
  showRsi: boolean;
  showOrb: boolean;
  showFvg: boolean;
  showRiskRewardBox: boolean;
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

function calculateRsiSeries(values: number[], period = 14) {
  if (values.length <= period) {
    return values.map(() => 50);
  }

  return values.map((_, index) => {
    if (index < period) {
      return 50;
    }

    return calculateRSI(values.slice(0, index + 1), period);
  });
}

function buildRsiPolyline(values: number[], width: number, height: number) {
  if (!values.length) {
    return "";
  }

  if (values.length === 1) {
    const y = height - (Math.max(0, Math.min(100, values[0])) / 100) * height;
    return `0,${y.toFixed(2)} ${width},${y.toFixed(2)}`;
  }

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - (Math.max(0, Math.min(100, value)) / 100) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
