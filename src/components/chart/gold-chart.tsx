"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";
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
import type { Candle, CandleSyncState, FvgAnalysis, LiveConnectionStatus, MarketScenarioLevel, MarketTick, OrbAnalysis, OrderBlockZone, SymbolProfile, Timeframe, TradePlan } from "@/types";
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
  showTradeLevels: true,
  showOrderBlocks: true,
  showOrderBlocksH1: true,
  showOrderBlocksM15: true,
  showLiquidityLevels: false,
  showRsi: true,
  showOrb: true,
  showFvg: true,
  showScenarioAnalysis: true,
  showRiskRewardBox: true,
  showMarketStructure: true,
  showHhHl: false,
  showBos: true,
  showChoch: true,
  showTrendline: false,
  showFibonacci: false,
  showCrtLevels: false,
  showRejectionZones: true,
  showEntryZone: true,
  showStopLoss: true,
  showTakeProfit: true,
  showBuySellSignal: true,
  showQuickAnalysisSummary: true,
  showLegend: false,
  showEmptyHelper: true,
};

const RIGHT_PADDING_BARS = 16;
const MIN_VISIBLE_BARS = 24;
const DEFAULT_VISIBLE_BARS = 95;
const CHART_HEIGHT_STORAGE_KEY = "tradetsr-chart-height";
const CHART_HEIGHTS = {
  small: 300,
  normal: 500,
  large: 750,
} as const;

export function GoldChart({
  candleMap,
  candleSync,
  connectionMessage,
  connectionSource,
  connectionStatus,
  executionSourceLabel,
  lastTick,
  orderBlock,
  fvg,
  orb,
  onTimeframeChange,
  plan,
  symbolProfile,
  syncState,
  timeframe,
}: {
  candleMap: Record<Timeframe, Candle[]>;
  candleSync: Record<Timeframe, CandleSyncState>;
  connectionMessage: string;
  connectionSource: string | null;
  connectionStatus: LiveConnectionStatus;
  executionSourceLabel: string;
  lastTick: MarketTick | null;
  orderBlock?: OrderBlockZone | null;
  fvg?: FvgAnalysis | null;
  orb?: OrbAnalysis | null;
  onTimeframeChange: (timeframe: Timeframe) => void;
  plan: TradePlan;
  symbolProfile: SymbolProfile;
  syncState: {
    message: string;
    priceWarning: string | null;
    status: "SYNC OK" | "PARTIAL SYNC" | "NOT SYNCED";
  };
  timeframe: Timeframe;
}) {
  const candles = candleMap[timeframe];
  const sync = candleSync[timeframe];
  const [ohlc, setOhlc] = useState<Candle | null>(candles.at(-1) ?? null);
  const [orderBlockOverlay, setOrderBlockOverlay] = useState<OrderBlockOverlay | null>(null);
  const [fvgOverlay, setFvgOverlay] = useState<ZoneOverlay | null>(null);
  const [scenarioOverlay, setScenarioOverlay] = useState<ScenarioOverlay | null>(null);
  const [riskRewardOverlay, setRiskRewardOverlay] = useState<RiskRewardOverlay | null>(null);
  const [riskRewardNotice, setRiskRewardNotice] = useState<string | null>(null);
  const [fallbackDelayElapsed, setFallbackDelayElapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoFollow, setAutoFollow] = useState(true);
  const [chartHeight, setChartHeight] = useState(() => loadSavedChartHeight());
  const [chartFullscreen, setChartFullscreen] = useState(false);
  const [resizingChart, setResizingChart] = useState(false);
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
  const chartAreaRef = useRef<HTMLDivElement>(null);
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
  const previousLatestTimeRef = useRef<number | null>(null);

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
  const tradingViewSymbol = getTradingViewFallbackSymbol(symbolProfile.symbol);
  const cryptoTradingViewAvailable = Boolean(tradingViewSymbol && symbolProfile.category === "Crypto");
  const exnessSourceConfirmed = isExnessSource(connectionSource);
  const cryptoOhlcActive = connectionSource === "Crypto OHLC Feed";
  const showTradingViewFallback = Boolean(displaySettings.showEmptyHelper && cryptoTradingViewAvailable && !exnessSourceConfirmed && (cryptoOhlcActive || fallbackDelayElapsed));
  const marketClosed = Boolean(displaySettings.showEmptyHelper && !candles.length && !showTradingViewFallback && isLikelyWeekendClosed(symbolProfile.category));
  const chartSourceLabel = showTradingViewFallback ? "TradingView Crypto" : "MT5 Bridge";
  const analysisSourceLabel = showTradingViewFallback
    ? cryptoOhlcActive
      ? "Crypto OHLC Feed"
      : "TradingView visual mode"
    : exnessSourceConfirmed
      ? "Exness / MT5 Bridge"
      : cryptoOhlcActive
        ? "Crypto OHLC Feed"
        : symbolProfile.category === "Crypto"
          ? "TradingView visual mode"
          : "MT5 Bridge OHLC";
  const lastAnalysisCandleLabel = candles.at(-1) ? formatUtcTime(candles.at(-1)?.time) : "--";
  const candleCountLabel = `M1 ${candleMap.M1.length} / M5 ${candleMap.M5.length} / M15 ${candleMap.M15.length} / H1 ${candleMap.H1.length}`;
  const sourceTruthLabel = sync?.official ? "OHLC MT5 officiel" : sync?.reconstructed ? "Reconstruit/fallback, non officiel" : "OHLC MT5 absent";
  const fallbackHint =
    showTradingViewFallback && connectionSource
      ? `MT5 indisponible pour ${symbolProfile.symbol}. Derniere source app: ${connectionSource}.`
      : `Aucun tick MT5 exploitable pour ${symbolProfile.symbol} apres quelques secondes.`;

  useEffect(() => {
    function handleStrategyDisplay(event: Event) {
      const detail = (event as CustomEvent<StrategyDisplayCommand>).detail;
      setDisplaySettings((current) => applyStrategyDisplayCommand(current, detail));
    }

    window.addEventListener("tradetsr-strategy-display", handleStrategyDisplay);
    return () => window.removeEventListener("tradetsr-strategy-display", handleStrategyDisplay);
  }, []);

  useEffect(() => {
    setFallbackDelayElapsed(false);

    if (candles.length || symbolProfile.category !== "Crypto") {
      return;
    }

    const timer = window.setTimeout(() => {
      setFallbackDelayElapsed(true);
    }, 4500);

    return () => window.clearTimeout(timer);
  }, [candles.length, symbolProfile.category, symbolProfile.symbol, timeframe]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const chart = createChart(container, {
      autoSize: true,
      height: CHART_HEIGHTS.normal,
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
    window.localStorage.setItem(CHART_HEIGHT_STORAGE_KEY, String(chartHeight));
  }, [chartHeight]);

  useEffect(() => {
    resizeChartToContainer();
    const timer = window.setTimeout(() => {
      resizeChartToContainer();
      if (autoFollowRef.current) {
        keepLatestCandleVisible(false);
      }
    }, 80);

    return () => window.clearTimeout(timer);
  }, [chartFullscreen, chartHeight]);

  useEffect(() => {
    autoFollowRef.current = autoFollow;
  }, [autoFollow]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      resizeChartToContainer();
    });

    observer.observe(container);

    return () => observer.disconnect();
  }, []);

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
    const latestTime = latestCandle?.time ?? null;
    const sameLengthNewCandle = Boolean(candles.length && candles.length === previousLengthRef.current && latestTime && previousLatestTimeRef.current && latestTime !== previousLatestTimeRef.current);
    const historyReplaced = candles.length > previousLengthRef.current + 1 || sameLengthNewCandle;
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
    previousLatestTimeRef.current = latestTime;
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
      if (displaySettings.showEntryZone) {
      addPriceLine(series, priceLineRefs.current, plan.entry, "#facc15", "Entry");
      }
      if (displaySettings.showStopLoss) {
      addPriceLine(series, priceLineRefs.current, plan.stopLoss, "#fb7185", "SL");
      }
      if (displaySettings.showTakeProfit) {
        plan.takeProfits.forEach((target, index) => addPriceLine(series, priceLineRefs.current, target, "#34d399", `TP${index + 1}`));
      }
    }

    if (displaySettings.showRiskRewardBox && plan.decision !== "WAIT") {
      addPriceLine(series, priceLineRefs.current, plan.entry, "#fde047", "RR Entry");
      addPriceLine(series, priceLineRefs.current, plan.stopLoss, "#fb7185", "RR SL");
      addPriceLine(series, priceLineRefs.current, plan.takeProfits[0], "#34d399", "RR TP1");
      addPriceLine(series, priceLineRefs.current, plan.takeProfits[1], "#22c55e", "RR TP2");
    }

    if (displaySettings.showOrderBlocks && (displaySettings.showOrderBlocksH1 || displaySettings.showOrderBlocksM15) && activeOrderBlock) {
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
    const series = seriesRef.current;
    const chart = chartRef.current;

    if (!series || !chart || !displaySettings.showScenarioAnalysis || !candles.length) {
      setScenarioOverlay(null);
      return;
    }

    const updateOverlay = () => {
      const overlay = buildScenarioOverlay({ plan, series, settings: displaySettings });
      setScenarioOverlay(overlay);
    };

    updateOverlay();
    chart.subscribeCrosshairMove(updateOverlay);
    chart.timeScale().subscribeVisibleLogicalRangeChange(updateOverlay);

    return () => {
      chart.unsubscribeCrosshairMove(updateOverlay);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateOverlay);
    };
  }, [candles.length, displaySettings, plan, timeframe]);

  useEffect(() => {
    const activeOrderBlock = orderBlock ?? plan.orderBlock;
    const series = seriesRef.current;

    if (!series || !activeOrderBlock || !displaySettings.showOrderBlocks || (!displaySettings.showOrderBlocksH1 && !displaySettings.showOrderBlocksM15)) {
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
      const entry = Number.isFinite(plan.entry) && plan.entry > 0 ? series.priceToCoordinate(plan.entry) : null;
      const sl = Number.isFinite(plan.stopLoss) && plan.stopLoss > 0 ? series.priceToCoordinate(plan.stopLoss) : null;
      const tp1 = Number.isFinite(plan.takeProfits[0]) && plan.takeProfits[0] > 0 ? series.priceToCoordinate(plan.takeProfits[0]) : null;
      const tp2 = Number.isFinite(plan.takeProfits[1]) && plan.takeProfits[1] > 0 ? series.priceToCoordinate(plan.takeProfits[1]) : null;
      const poi = series.priceToCoordinate((activeOrderBlock.high + activeOrderBlock.low) / 2);
      const latest = latestCandleRef.current;
      const structuralHigh = candles.length ? series.priceToCoordinate(Math.max(...candles.slice(-80).map((candle) => candle.high))) : null;
      const structuralLow = candles.length ? series.priceToCoordinate(Math.min(...candles.slice(-80).map((candle) => candle.low))) : null;
      const hasTradePlan =
        plan.decision !== "WAIT" &&
        plan.direction !== "Neutral" &&
        entry !== null &&
        sl !== null &&
        tp1 !== null &&
        ((bullish && plan.stopLoss < plan.entry && plan.takeProfits[0] > plan.entry) || (!bullish && plan.stopLoss > plan.entry && plan.takeProfits[0] < plan.entry));

      setOrderBlockOverlay({
        top: Math.min(high, low),
        height: Math.max(4, Math.abs(low - high)),
        background: bullish ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
        border: bullish ? "rgba(34, 197, 94, 0.55)" : "rgba(239, 68, 68, 0.55)",
        direction: activeOrderBlock.direction,
        entry: hasTradePlan && entry !== null ? { price: plan.entry, y: entry } : null,
        inducementY: bullish ? structuralLow : structuralHigh,
        label: `${bullish ? "Bullish" : "Bearish"} OB ${activeOrderBlock.score}/100 - ${activeOrderBlock.strength}`,
        poiY: poi,
        sl: hasTradePlan && sl !== null ? { price: plan.stopLoss, y: sl } : null,
        structureLabel: activeOrderBlock.bosConfirmed ? "BOS" : "CHoCH",
        structureY: bullish ? structuralHigh : structuralLow,
        touched: activeOrderBlock.touched,
        tp1: hasTradePlan && tp1 !== null ? { price: plan.takeProfits[0], y: tp1 } : null,
        tp2: hasTradePlan && tp2 !== null ? { price: plan.takeProfits[1], y: tp2 } : null,
        triggerLabel: latest ? (bullish ? "BUY entry zone" : "SELL entry zone") : "Entry zone",
      });
    };

    updateOverlay();
    chartRef.current?.subscribeCrosshairMove(updateOverlay);

    return () => {
      chartRef.current?.unsubscribeCrosshairMove(updateOverlay);
    };
  }, [candles, displaySettings.showOrderBlocks, orderBlock, plan.decision, plan.direction, plan.entry, plan.orderBlock, plan.stopLoss, plan.takeProfits, timeframe]);

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

  function resizeChartToContainer() {
    const chart = chartRef.current;
    const container = containerRef.current;

    if (!chart || !container) {
      return;
    }

    chart.resize(container.clientWidth, container.clientHeight);
  }

  function setChartPreset(preset: ChartSizePreset) {
    setChartFullscreen(false);
    setChartHeight(clampChartHeight(CHART_HEIGHTS[preset]));
  }

  function startChartResize(event: PointerEvent<HTMLButtonElement>) {
    if (chartFullscreen) {
      return;
    }

    event.preventDefault();
    const startY = event.clientY;
    const startHeight = chartHeight;
    setResizingChart(true);

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      setChartHeight(clampChartHeight(startHeight + moveEvent.clientY - startY));
    };

    const handleUp = () => {
      setResizingChart(false);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  const chartAreaHeight = chartFullscreen ? "calc(100vh - 210px)" : `${chartHeight}px`;

  return (
    <section className={`relative rounded-md border border-white/10 bg-[#171717] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.22)] ${chartFullscreen ? "fixed inset-0 z-[100] overflow-auto rounded-none border-0" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        {displaySettings.showTicker ? (
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-md bg-amber-300/10 text-amber-200">
              {connectionStatus === "live" ? <Wifi size={18} /> : <WifiOff size={18} />}
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">{symbolProfile.symbol} live chart</h2>
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
          <div className="ml-1 flex rounded-md border border-white/10 bg-black/25 p-1">
            <ChartSizeButton active={!chartFullscreen && chartHeight <= CHART_HEIGHTS.small + 20} label="Petit" onClick={() => setChartPreset("small")} />
            <ChartSizeButton active={!chartFullscreen && chartHeight > CHART_HEIGHTS.small + 20 && chartHeight < CHART_HEIGHTS.large - 80} label="Normal" onClick={() => setChartPreset("normal")} />
            <ChartSizeButton active={!chartFullscreen && chartHeight >= CHART_HEIGHTS.large - 80} label="Grand" onClick={() => setChartPreset("large")} />
          </div>
          <button
            className={`h-8 rounded border px-3 text-xs font-semibold transition ${
              chartFullscreen ? "border-rose-300/35 bg-rose-300/15 text-rose-100" : "border-sky-300/25 bg-sky-300/10 text-sky-100 hover:bg-sky-300/15"
            }`}
            type="button"
            onClick={() => setChartFullscreen((value) => !value)}
          >
            {chartFullscreen ? "Quitter plein écran" : "Plein écran"}
          </button>
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
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${autoFollow ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200" : "border-amber-300/25 bg-amber-300/10 text-amber-100"}`}>
            {autoFollow ? "Live follow ON" : "Viewing history"}
          </span>
          <span className={`rounded border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${showTradingViewFallback ? "border-sky-300/25 bg-sky-300/10 text-sky-100" : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"}`}>
            Source graphique : {chartSourceLabel}
          </span>
          <span className="rounded border border-violet-300/25 bg-violet-300/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-100">
            Source analyse : {analysisSourceLabel}
          </span>
          <span className={`rounded border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${sync?.official ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-amber-300/25 bg-amber-300/10 text-amber-100"}`}>
            Source bougies : {sourceTruthLabel}
          </span>
          <span className="rounded border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-200">
            Symbole broker : {sync?.brokerSymbol ?? lastTick?.symbol ?? symbolProfile.symbol}
          </span>
          <span className="rounded border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-200">
            Bougies chargees : {candleCountLabel}
          </span>
          <span className="rounded border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-100">
            Source execution : {executionSourceLabel}
          </span>
          <span className={`rounded border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${getSyncBadgeClass(syncState.status)}`}>
            {syncState.status}
          </span>
          {symbolProfile.category === "Crypto" ? (
            <>
              <span className="rounded border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-200">
                Derniere bougie recue : {lastAnalysisCandleLabel}
              </span>
              <span className="rounded border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-200">
                Timeframe : {timeframe}
              </span>
              <span className="rounded border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-200">
                Signal : {plan.decision}
              </span>
              <span className="rounded border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-200">
                Confiance : {plan.score}/100
              </span>
            </>
          ) : null}
        </div>
        <button
          className="inline-flex h-8 items-center gap-2 rounded border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]"
          type="button"
          onClick={goToLatestCandle}
        >
          <Crosshair size={15} />
          Go to latest candle
        </button>
      </div>

      {showTradingViewFallback ? <TradingViewFallbackNotice analysisSourceLabel={analysisSourceLabel} fallbackHint={fallbackHint} symbolProfile={symbolProfile} /> : null}
      {showTradingViewFallback || !sync?.official ? (
        <div className="mt-2 rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">
          TradingView peut differer de MT5 si le broker/source n'est pas identique. Les signaux de trading sont bases sur MT5/Exness; une bougie reconstruite ou externe reste indicative.
        </div>
      ) : null}

      <div
        ref={chartAreaRef}
        className={`relative mt-3 w-full overflow-hidden rounded-md border border-white/10 bg-[#06080c] ${resizingChart ? "select-none ring-1 ring-amber-300/35" : ""}`}
        style={{ height: chartAreaHeight, maxHeight: chartFullscreen ? "none" : "90vh", minHeight: CHART_HEIGHTS.small }}
      >
        {syncState.status !== "SYNC OK" ? <SyncWarning syncState={syncState} /> : null}
        <div ref={containerRef} className="h-full w-full" />
        {showTradingViewFallback && tradingViewSymbol ? <TradingViewFallbackChart symbol={tradingViewSymbol} symbolProfile={symbolProfile} timeframe={timeframe} /> : null}
        {orderBlockOverlay ? <OrderBlockSchematic overlay={orderBlockOverlay} /> : null}
        {scenarioOverlay ? <ScenarioVisualOverlay overlay={scenarioOverlay} /> : null}
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
        {!showTradingViewFallback && riskRewardOverlay ? <RiskRewardBox overlay={riskRewardOverlay} /> : null}
        {!candles.length && displaySettings.showEmptyHelper && !showTradingViewFallback ? <ChartEmptyState connectionMessage={connectionMessage} connectionStatus={connectionStatus} marketClosed={marketClosed} plan={plan} symbolProfile={symbolProfile} timeframe={timeframe} /> : null}
      </div>
      {!chartFullscreen ? (
        <button
          aria-label="Redimensionner le graphique"
          className="group hidden h-6 w-full cursor-ns-resize items-center justify-center rounded-b-md border-x border-b border-white/10 bg-black/25 transition hover:bg-white/[0.05] md:flex"
          type="button"
          onPointerDown={startChartResize}
        >
          <span className="h-1 w-16 rounded-full bg-slate-600 transition group-hover:bg-amber-300" />
        </button>
      ) : null}

      {!showTradingViewFallback && !riskRewardOverlay && riskRewardNotice ? <RiskRewardNotice message={riskRewardNotice} /> : null}

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

  function applySimpleMode() {
    onChange({
      ...settings,
      showBos: false,
      showBuySellSignal: true,
      showChoch: false,
      showCrtLevels: false,
      showEntryZone: true,
      showFibonacci: false,
      showFvg: false,
      showHhHl: false,
      showLiquidityLevels: false,
      showMarketStructure: false,
      showOrderBlocks: true,
      showOrderBlocksH1: true,
      showOrderBlocksM15: false,
      showQuickAnalysisSummary: true,
      showRejectionZones: false,
      showRiskRewardBox: true,
      showRsi: false,
      showScenarioAnalysis: true,
      showStopLoss: true,
      showTakeProfit: true,
      showTradeLevels: true,
      showTrendline: false,
    });
  }

  function applyDetailsMode() {
    onChange({
      ...settings,
      showBos: true,
      showBuySellSignal: true,
      showChoch: true,
      showCrtLevels: true,
      showEntryZone: true,
      showFibonacci: true,
      showFvg: true,
      showHhHl: true,
      showLiquidityLevels: true,
      showMarketStructure: true,
      showOrderBlocks: true,
      showOrderBlocksH1: true,
      showOrderBlocksM15: true,
      showQuickAnalysisSummary: true,
      showRejectionZones: true,
      showRiskRewardBox: true,
      showRsi: true,
      showScenarioAnalysis: true,
      showStopLoss: true,
      showTakeProfit: true,
      showTradeLevels: true,
      showTrendline: true,
    });
  }

  return (
    <div className="absolute right-0 top-10 z-[60] w-72 rounded-md border border-white/15 bg-[#101419] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-white/10 pb-2">
        <div>
          <p className="text-sm font-semibold text-white">Affichage</p>
          <p className="text-[11px] text-slate-500">Choisis ce qui reste visible sur le chart.</p>
        </div>
        <button className="text-xs text-slate-400 transition hover:text-white" type="button" onClick={onClose}>
          Fermer
        </button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-1 rounded-md border border-white/10 bg-black/25 p-1">
        <button className="rounded px-2 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.06]" type="button" onClick={applySimpleMode}>
          Mode simple
        </button>
        <button className="rounded px-2 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.06]" type="button" onClick={applyDetailsMode}>
          Mode details
        </button>
      </div>

      <p className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-200">Affichage graphique</p>
      <div className="grid max-h-[60vh] gap-1.5 overflow-y-auto pr-1 text-sm text-slate-200">
        <DisplayToggle checked={settings.showTicker} label="Show ticker" onChange={(value) => update("showTicker", value)} />
        <DisplayToggle checked={settings.showOhlc} label="Show OHLC" onChange={(value) => update("showOhlc", value)} />
        <DisplayToggle checked={settings.showQuickTimeframes} label="Show quick timeframe buttons" onChange={(value) => update("showQuickTimeframes", value)} />
        <DisplayToggle checked={settings.showBidPriceLine} label="Show bid price line" onChange={(value) => update("showBidPriceLine", value)} />
        <DisplayToggle checked={settings.showAskPriceLine} label="Show ask price line" onChange={(value) => update("showAskPriceLine", value)} />
        <DisplayToggle checked={settings.showLastPriceLine} label="Show last price line" onChange={(value) => update("showLastPriceLine", value)} />
        <DisplayToggle checked={settings.showPeriodSeparators} label="Show period separators" onChange={(value) => update("showPeriodSeparators", value)} />
        <DisplayToggle checked={settings.showGrid} label="Show grid" onChange={(value) => update("showGrid", value)} />
        <DisplayToggle checked={settings.showOrderBlocksH1} label="Afficher Order Blocks H1" onChange={(value) => update("showOrderBlocksH1", value)} />
        <DisplayToggle checked={settings.showOrderBlocksM15} label="Afficher Order Blocks M15" onChange={(value) => update("showOrderBlocksM15", value)} />
        <DisplayToggle checked={settings.showOrderBlocks} label="Afficher zones Order Block" onChange={(value) => update("showOrderBlocks", value)} />
        <DisplayToggle checked={settings.showMarketStructure} label="Afficher Structure du marche" onChange={(value) => update("showMarketStructure", value)} />
        <DisplayToggle checked={settings.showHhHl} label="Afficher HH / HL / LH / LL" onChange={(value) => update("showHhHl", value)} />
        <DisplayToggle checked={settings.showBos} label="Afficher BOS" onChange={(value) => update("showBos", value)} />
        <DisplayToggle checked={settings.showChoch} label="Afficher ChoCH" onChange={(value) => update("showChoch", value)} />
        <DisplayToggle checked={settings.showTrendline} label="Afficher Trendline" onChange={(value) => update("showTrendline", value)} />
        <DisplayToggle checked={settings.showFibonacci} label="Afficher Fibonacci" onChange={(value) => update("showFibonacci", value)} />
        <DisplayToggle checked={settings.showRsi} label="Afficher RSI" onChange={(value) => update("showRsi", value)} />
        <DisplayToggle checked={settings.showCrtLevels} label="Afficher CRT Levels" onChange={(value) => update("showCrtLevels", value)} />
        <DisplayToggle checked={settings.showLiquidityLevels} label="Afficher zones de liquidite" onChange={(value) => update("showLiquidityLevels", value)} />
        <DisplayToggle checked={settings.showRejectionZones} label="Afficher zones de rejet" onChange={(value) => update("showRejectionZones", value)} />
        <DisplayToggle checked={settings.showEntryZone} label="Afficher Entry Zone" onChange={(value) => update("showEntryZone", value)} />
        <DisplayToggle checked={settings.showStopLoss} label="Afficher Stop Loss" onChange={(value) => update("showStopLoss", value)} />
        <DisplayToggle checked={settings.showTakeProfit} label="Afficher Take Profit" onChange={(value) => update("showTakeProfit", value)} />
        <DisplayToggle checked={settings.showRiskRewardBox} label="Afficher Risk Reward" onChange={(value) => update("showRiskRewardBox", value)} />
        <DisplayToggle checked={settings.showBuySellSignal} label="Afficher Signal BUY / SELL" onChange={(value) => update("showBuySellSignal", value)} />
        <DisplayToggle checked={settings.showQuickAnalysisSummary} label="Afficher resume Analyse rapide" onChange={(value) => update("showQuickAnalysisSummary", value)} />
        <DisplayToggle checked={settings.showTradeLevels} label="Show trade levels" onChange={(value) => update("showTradeLevels", value)} />
        <DisplayToggle checked={settings.showOrb} label="Show ORB high/low" onChange={(value) => update("showOrb", value)} />
        <DisplayToggle checked={settings.showFvg} label="Show FVG zones" onChange={(value) => update("showFvg", value)} />
        <DisplayToggle checked={settings.showScenarioAnalysis} label="Afficher analyse graphique" onChange={(value) => update("showScenarioAnalysis", value)} />
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
  marketClosed,
  plan,
  symbolProfile,
  timeframe,
}: {
  connectionMessage: string;
  connectionStatus: LiveConnectionStatus;
  marketClosed: boolean;
  plan: TradePlan;
  symbolProfile: SymbolProfile;
  timeframe: Timeframe;
}) {
  const live = connectionStatus === "live";
  const title = marketClosed ? `Marche ferme pour ${symbolProfile.symbol}` : `Graphique ${symbolProfile.symbol} ${timeframe} en attente de bougies live`;
  const description = marketClosed
    ? `${symbolProfile.category} est probablement ferme le week-end. Le graphique reprendra automatiquement quand le marche ou MT5 fournira des bougies.`
    : connectionMessage;
  const notice = marketClosed
    ? "Le chart n'affiche pas de zone vide: le marche semble ferme pour cet actif. Les signaux restent en attente jusqu'a la reprise du flux."
    : symbolProfile.category === "Crypto"
      ? "Recherche du flux MT5 en cours. Si aucun tick crypto n'arrive, le graphique bascule automatiquement vers TradingView fallback."
      : "Le chart n'affiche pas de zone vide: il attend un flux MT5 exploitable avant de dessiner les bougies, les Order Blocks et la liquidite.";

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
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <EmptyStep icon={<Wifi size={16} />} label="1. Bridge MT5" value={`Lance Star Gold Bridge sur ${symbolProfile.symbol}`} />
              <EmptyStep icon={<Target size={16} />} label="2. Timeframe" value={`Choisis une timeframe adaptee a ${symbolProfile.category}`} />
              <EmptyStep icon={<Gauge size={16} />} label="3. Donnees" value={marketClosed ? "Marche ferme: aucune bougie live attendue maintenant" : "Attends les premieres bougies broker"} />
              <EmptyStep icon={<ShieldAlert size={16} />} label="4. Risque" value="Aucun signal sans confirmation live" />
            </div>
          </div>

          <div className="mt-4 rounded-md border border-amber-300/20 bg-amber-300/10 p-3">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 shrink-0 text-amber-200" size={18} />
              <p className="text-sm leading-6 text-amber-100">
                {notice}
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

function OrderBlockSchematic({ overlay }: { overlay: OrderBlockOverlay }) {
  const bullish = overlay.direction === "bullish";
  const accent = bullish ? "rgba(168, 85, 247, 0.78)" : "rgba(249, 115, 22, 0.78)";
  const fill = bullish ? "rgba(168, 85, 247, 0.34)" : "rgba(249, 115, 22, 0.28)";
  const entry = overlay.entry;
  const hasPlan = Boolean(entry && overlay.sl && overlay.tp1);
  const planTop = Math.min(entry?.y ?? overlay.top, overlay.sl?.y ?? overlay.top, overlay.tp2?.y ?? overlay.tp1?.y ?? overlay.top);
  const planBottom = Math.max(entry?.y ?? overlay.top, overlay.sl?.y ?? overlay.top, overlay.tp2?.y ?? overlay.tp1?.y ?? overlay.top);

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {overlay.structureY !== null ? (
        <StructureLine label={overlay.structureLabel} top={overlay.structureY} />
      ) : null}
      {overlay.inducementY !== null ? (
        <StructureLine label="Inducement / liquidity" muted top={overlay.inducementY} />
      ) : null}

      <div
        className="absolute left-[8%] right-[12%] rounded-sm border-y-2 shadow-[0_12px_35px_rgba(0,0,0,0.28)]"
        style={{
          top: overlay.top,
          height: overlay.height,
          background: fill,
          borderColor: accent,
        }}
      >
        <span className="absolute left-2 top-1 rounded bg-black/70 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-lg">
          Order Block
        </span>
        <span className="absolute right-2 top-1 rounded px-2 py-1 font-mono text-[10px] font-bold text-white shadow-lg" style={{ background: accent }}>
          {overlay.label}
        </span>
        {overlay.poiY !== null ? (
          <div className="absolute left-0 right-0 border-t border-dashed border-white/55" style={{ top: overlay.poiY - overlay.top }}>
            <span className="absolute left-[45%] -top-3 rounded bg-black/65 px-2 py-0.5 text-[10px] font-semibold text-slate-100">POI</span>
          </div>
        ) : null}
        {overlay.touched ? (
          <span className="absolute bottom-1 left-2 rounded border border-emerald-300/25 bg-emerald-300/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-100">
            retest touched
          </span>
        ) : null}
      </div>

      {hasPlan ? (
        <div className="absolute right-[4%] w-[30%] min-w-[190px] max-w-[330px]" style={{ top: Math.max(4, planTop), height: Math.max(36, planBottom - planTop) }}>
          {overlay.tp2 ? <TradePlanLine color="bg-emerald-400" label={`TP2 ${formatPrice(overlay.tp2.price)}`} top={overlay.tp2.y - planTop} /> : null}
          {overlay.tp1 ? <TradePlanLine color="bg-emerald-300" label={`TP1 ${formatPrice(overlay.tp1.price)}`} top={overlay.tp1.y - planTop} /> : null}
          {overlay.entry ? <TradePlanLine color="bg-amber-200" label={`Entry ${formatPrice(overlay.entry.price)}`} top={overlay.entry.y - planTop} /> : null}
          {overlay.sl ? <TradePlanLine color="bg-rose-300" label={`SL ${formatPrice(overlay.sl.price)}`} top={overlay.sl.y - planTop} /> : null}
          <div
            className={`absolute right-full mr-2 h-px w-16 ${bullish ? "bg-emerald-300" : "bg-rose-300"}`}
            style={{ top: Math.max(0, (overlay.entry?.y ?? planTop) - planTop) }}
          >
            <span className={`absolute -top-3 ${bullish ? "right-full" : "left-full"} rounded bg-black/75 px-2 py-0.5 text-[10px] font-bold text-white shadow-lg`}>
              {overlay.triggerLabel}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StructureLine({ label, muted, top }: { label: string; muted?: boolean; top: number }) {
  return (
    <div className="absolute left-[8%] right-[12%]" style={{ top }}>
      <div className={`border-t ${muted ? "border-dashed border-slate-200/35" : "border-solid border-slate-100/65"}`} />
      <span className={`absolute left-1/2 -top-3 -translate-x-1/2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-semibold shadow-lg ${muted ? "text-slate-300" : "text-white"}`}>
        {label}
      </span>
    </div>
  );
}

function TradePlanLine({ color, label, top }: { color: string; label: string; top: number }) {
  return (
    <div className="absolute left-0 right-0" style={{ top }}>
      <div className={`h-px ${color}`} />
      <span className="absolute right-0 top-1 rounded bg-black/75 px-2 py-0.5 font-mono text-[10px] font-semibold text-white shadow-lg">{label}</span>
    </div>
  );
}

function SyncWarning({
  syncState,
}: {
  syncState: {
    message: string;
    priceWarning: string | null;
    status: "SYNC OK" | "PARTIAL SYNC" | "NOT SYNCED";
  };
}) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-20 max-w-[min(560px,calc(100%-1.5rem))] rounded-md border border-rose-300/30 bg-[#1f0b12]/90 px-3 py-2 shadow-[0_14px_45px_rgba(0,0,0,0.45)] backdrop-blur">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-100">{syncState.status}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-white">{syncState.message}</p>
      {syncState.priceWarning ? <p className="mt-1 text-[11px] leading-4 text-rose-100">{syncState.priceWarning}</p> : null}
    </div>
  );
}

function TradingViewFallbackNotice({
  analysisSourceLabel,
  fallbackHint,
  symbolProfile,
}: {
  analysisSourceLabel: string;
  fallbackHint: string;
  symbolProfile: SymbolProfile;
}) {
  return (
    <div className="mt-3 rounded-md border border-sky-300/20 bg-[#07111f] px-3 py-2 shadow-[0_10px_35px_rgba(0,0,0,0.22)]">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200">Source graphique : TradingView Crypto</p>
      <p className="mt-1 text-xs leading-5 text-slate-200">
        {symbolProfile.symbol} affiche TradingView Crypto. TradingView peut venir d'un autre broker; les signaux de trading Exness restent bases sur MT5/Exness quand les OHLC officiels sont disponibles.
      </p>
      <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
        <span className="rounded border border-violet-300/20 bg-violet-300/10 px-2 py-0.5 text-violet-100">Source analyse : {analysisSourceLabel}</span>
        <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 text-slate-300">{fallbackHint}</span>
      </div>
    </div>
  );
}

function TradingViewFallbackChart({
  symbol,
  symbolProfile,
  timeframe,
}: {
  symbol: string;
  symbolProfile: SymbolProfile;
  timeframe: Timeframe;
}) {
  const interval = getTradingViewInterval(timeframe);
  const src = `https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(symbol)}&interval=${interval}&hidesidetoolbar=1&hideideas=1&symboledit=0&saveimage=0&toolbarbg=0f172a&studies=[]&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=1`;

  return (
    <div className="absolute inset-0 z-20 bg-[#06080c]">
      <iframe
        className="h-full w-full border-0"
        src={src}
        title={`TradingView fallback ${symbolProfile.symbol}`}
      />
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

function buildScenarioOverlay({ plan, series, settings }: { plan: TradePlan; series: ISeriesApi<"Candlestick">; settings: ChartDisplaySettings }): ScenarioOverlay | null {
  const scenario = plan.marketScenario;
  const quick = plan.quickAnalysis;
  const quickTone = quick?.h1Direction === "Bullish" ? "buy" : quick?.h1Direction === "Bearish" ? "sell" : "wait";
  const zones = [
    quick && settings.showEntryZone ? buildScenarioZone(quick.entryZone.low, quick.entryZone.high, "ENTRY ZONE", quickTone, series) : null,
    quick && settings.showOrderBlocksH1 ? buildScenarioZone(quick.orderBlockZone.low, quick.orderBlockZone.high, "ORDER BLOCK H1", quickTone, series) : null,
    !quick || settings.showMarketStructure ? buildScenarioZone(scenario.buyZone.low, scenario.buyZone.high, "ZONE ACHAT", "buy", series) : null,
    !quick || settings.showMarketStructure ? buildScenarioZone(scenario.sellZone.low, scenario.sellZone.high, "ZONE VENTE", "sell", series) : null,
    !quick || settings.showMarketStructure ? buildScenarioZone(scenario.waitZone.low, scenario.waitZone.high, "ATTENTE", "wait", series) : null,
  ].filter(Boolean) as ScenarioZoneOverlay[];
  const quickLevels: MarketScenarioLevel[] = quick
    ? [
        settings.showEntryZone ? { label: "Entry", price: quick.idealEntry, tone: quickTone } : null,
        settings.showStopLoss ? { label: "SL", price: quick.stopLoss, tone: quickTone === "buy" ? "sell" : "buy" } : null,
        settings.showTakeProfit ? { label: "TP", price: quick.takeProfit, tone: quickTone } : null,
      ].filter(Boolean) as MarketScenarioLevel[]
    : [];
  const structureLevels = settings.showLiquidityLevels || settings.showMarketStructure ? scenario.keyLevels : [];
  const levels = [...quickLevels, ...structureLevels]
    .map((level) => {
      const y = series.priceToCoordinate(level.price);
      return y === null ? null : { ...level, y };
    })
    .filter(Boolean) as ScenarioLevelOverlay[];

  if (!zones.length && !levels.length) {
    return null;
  }

  return {
    arrow: scenario.arrow,
    entryState: scenario.entryState,
    levels,
    phase: scenario.phase,
    pricePosition: scenario.pricePosition,
    primaryBias: scenario.primaryBias,
    requiredConfirmation: scenario.requiredConfirmation,
    showBuySellSignal: settings.showBuySellSignal,
    showSummary: settings.showQuickAnalysisSummary,
    zones,
  };
}

function buildScenarioZone(low: number, high: number, label: string, tone: ScenarioZoneOverlay["tone"], series: ISeriesApi<"Candlestick">) {
  if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high <= 0 || low === high) {
    return null;
  }

  const topPrice = Math.max(low, high);
  const bottomPrice = Math.min(low, high);
  const top = series.priceToCoordinate(topPrice);
  const bottom = series.priceToCoordinate(bottomPrice);

  if (top === null || bottom === null) {
    return null;
  }

  return {
    height: Math.max(6, Math.abs(bottom - top)),
    label,
    low: bottomPrice,
    high: topPrice,
    tone,
    top: Math.min(top, bottom),
  };
}

function ScenarioVisualOverlay({ overlay }: { overlay: ScenarioOverlay }) {
  const scenarioTone =
    overlay.primaryBias === "Buy"
      ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
      : overlay.primaryBias === "Sell"
        ? "border-rose-300/30 bg-rose-300/10 text-rose-100"
        : "border-slate-300/20 bg-slate-300/10 text-slate-100";

  return (
    <div className="pointer-events-none absolute inset-0 z-[12]">
      {overlay.zones.map((zone) => (
        <div
          key={`${zone.label}-${zone.low}-${zone.high}`}
          className={`absolute left-0 right-0 border-y ${getScenarioZoneClass(zone.tone)}`}
          style={{ top: zone.top, height: zone.height }}
        >
          <span className={`absolute left-2 top-1 rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] shadow-lg ${getScenarioLabelClass(zone.tone)}`}>
            {zone.label}
          </span>
        </div>
      ))}

      {overlay.levels.map((level) => (
        <div key={`${level.label}-${level.price}`} className="absolute left-0 right-0 border-t border-dashed border-white/25" style={{ top: level.y }}>
          <span className={`absolute right-2 -top-3 rounded px-2 py-0.5 font-mono text-[10px] font-semibold shadow-lg ${getScenarioLevelClass(level.tone)}`}>
            {level.label} {formatPrice(level.price)}
          </span>
        </div>
      ))}

      {overlay.showSummary ? (
      <div className={`absolute left-3 top-3 max-w-[320px] rounded-md border px-3 py-2 shadow-[0_12px_38px_rgba(0,0,0,0.35)] ${scenarioTone}`}>
        <p className="text-[10px] font-black uppercase tracking-[0.16em]">{formatScenarioPhase(overlay.phase)}</p>
        <p className="mt-1 text-xs font-semibold leading-5">
          {overlay.arrow.label} / {overlay.primaryBias} / {formatEntryStateLabel(overlay.entryState)}
        </p>
        <p className="mt-1 text-[11px] leading-4 opacity-90">{overlay.requiredConfirmation}</p>
      </div>
      ) : null}

      {overlay.showBuySellSignal ? (
      <div className={`absolute bottom-3 right-3 rounded-md border px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] shadow-lg ${scenarioTone}`}>
        {overlay.primaryBias === "Neutral" ? "WAIT" : overlay.primaryBias.toUpperCase()}
      </div>
      ) : null}

      <div className="absolute bottom-3 left-3 rounded-md border border-white/10 bg-black/65 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-200 shadow-lg">
        Zone detectee != entree immediate
      </div>
    </div>
  );
}

function getScenarioZoneClass(tone: ScenarioZoneOverlay["tone"]) {
  if (tone === "buy") {
    return "border-emerald-300/35 bg-emerald-300/12";
  }

  if (tone === "sell") {
    return "border-rose-300/35 bg-rose-300/12";
  }

  return "border-slate-300/25 bg-slate-300/10";
}

function getScenarioLabelClass(tone: ScenarioZoneOverlay["tone"]) {
  if (tone === "buy") {
    return "bg-emerald-500/85 text-black";
  }

  if (tone === "sell") {
    return "bg-rose-500/85 text-white";
  }

  return "bg-slate-500/85 text-white";
}

function getScenarioLevelClass(tone: ScenarioLevelOverlay["tone"]) {
  if (tone === "buy") {
    return "bg-emerald-300 text-black";
  }

  if (tone === "sell") {
    return "bg-rose-300 text-black";
  }

  if (tone === "wait") {
    return "bg-slate-300 text-black";
  }

  return "bg-black/75 text-white";
}

function formatScenarioPhase(phase: TradePlan["marketScenario"]["phase"]) {
  const labels: Record<TradePlan["marketScenario"]["phase"], string> = {
    "breakout": "CASSURE",
    "consolidation-range": "CONSOLIDATION",
    "high-risk": "RISQUE ELEVE",
    "inside-buy-zone": "ZONE ACHAT",
    "inside-sell-zone": "ZONE VENTE",
    "middle-zone": "ATTENTE",
    "near-buy-zone": "PROCHE ACHAT",
    "near-sell-zone": "PROCHE VENTE",
    "retest": "RETEST",
    "strong-trend": "TENDANCE FORTE",
  };

  return labels[phase];
}

function formatEntryStateLabel(state: TradePlan["marketScenario"]["entryState"]) {
  if (state === "confirmed-entry") {
    return "ENTREE CONFIRMEE";
  }

  if (state === "setup-forming") {
    return "SETUP EN FORMATION";
  }

  return "ZONE DETECTEE";
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
  const preview = plan.decision.includes("WATCH") || plan.decision.includes("PRE-SIGNAL");
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
    <div className="mt-2 rounded-md border border-amber-300/25 bg-amber-300/10 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">Risk/Reward Box</p>
        <p className="text-xs leading-5 text-amber-50">{message}</p>
      </div>
    </div>
  );
}

function getRiskRewardNotice(plan: TradePlan) {
  if (plan.decision === "WAIT" || plan.direction === "Neutral") {
    return "Masque: la decision finale est WAIT. Le RR box apparait seulement quand un plan PRE-SIGNAL, WATCH ou SCALP READY existe.";
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
  background: string;
  border: string;
  direction: "bullish" | "bearish";
  entry: { price: number; y: number } | null;
  height: number;
  inducementY: number | null;
  label: string;
  poiY: number | null;
  sl: { price: number; y: number } | null;
  structureLabel: string;
  structureY: number | null;
  top: number;
  touched: boolean;
  tp1: { price: number; y: number } | null;
  tp2: { price: number; y: number } | null;
  triggerLabel: string;
}

interface ZoneOverlay {
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

interface ScenarioOverlay {
  arrow: TradePlan["marketScenario"]["arrow"];
  entryState: TradePlan["marketScenario"]["entryState"];
  levels: ScenarioLevelOverlay[];
  phase: TradePlan["marketScenario"]["phase"];
  pricePosition: string;
  primaryBias: TradePlan["marketScenario"]["primaryBias"];
  requiredConfirmation: string;
  showBuySellSignal: boolean;
  showSummary: boolean;
  zones: ScenarioZoneOverlay[];
}

interface ScenarioZoneOverlay {
  height: number;
  high: number;
  label: string;
  low: number;
  tone: "buy" | "sell" | "wait";
  top: number;
}

interface ScenarioLevelOverlay {
  label: string;
  price: number;
  tone: "buy" | "sell" | "wait" | "neutral";
  y: number;
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
  showOrderBlocksH1: boolean;
  showOrderBlocksM15: boolean;
  showLiquidityLevels: boolean;
  showRsi: boolean;
  showOrb: boolean;
  showFvg: boolean;
  showScenarioAnalysis: boolean;
  showRiskRewardBox: boolean;
  showMarketStructure: boolean;
  showHhHl: boolean;
  showBos: boolean;
  showChoch: boolean;
  showTrendline: boolean;
  showFibonacci: boolean;
  showCrtLevels: boolean;
  showRejectionZones: boolean;
  showEntryZone: boolean;
  showStopLoss: boolean;
  showTakeProfit: boolean;
  showBuySellSignal: boolean;
  showQuickAnalysisSummary: boolean;
  showLegend: boolean;
  showEmptyHelper: boolean;
}

type StrategyDisplayCommand =
  | { action: "all" | "essentials" | "hide" | "reset" }
  | { action: "toggle"; key: keyof ChartDisplaySettings; value: boolean };

type ChartSizePreset = keyof typeof CHART_HEIGHTS;

const strategyDisplayKeys: Array<keyof ChartDisplaySettings> = [
  "showOrderBlocks",
  "showOrderBlocksH1",
  "showOrderBlocksM15",
  "showMarketStructure",
  "showHhHl",
  "showBos",
  "showChoch",
  "showTrendline",
  "showFibonacci",
  "showRsi",
  "showCrtLevels",
  "showLiquidityLevels",
  "showRejectionZones",
  "showEntryZone",
  "showStopLoss",
  "showTakeProfit",
  "showRiskRewardBox",
  "showBuySellSignal",
  "showQuickAnalysisSummary",
  "showTradeLevels",
  "showScenarioAnalysis",
];

function applyStrategyDisplayCommand(current: ChartDisplaySettings, command?: StrategyDisplayCommand): ChartDisplaySettings {
  if (!command) {
    return current;
  }

  if (command.action === "reset") {
    return defaultDisplaySettings;
  }

  if (command.action === "toggle") {
    return { ...current, [command.key]: command.value };
  }

  if (command.action === "hide") {
    return strategyDisplayKeys.reduce((settings, key) => ({ ...settings, [key]: false }), current);
  }

  if (command.action === "all") {
    return strategyDisplayKeys.reduce((settings, key) => ({ ...settings, [key]: true }), { ...current, showTradeLevels: true, showScenarioAnalysis: true });
  }

  return {
    ...current,
    showBos: false,
    showBuySellSignal: true,
    showChoch: false,
    showCrtLevels: false,
    showEntryZone: true,
    showFibonacci: false,
    showFvg: false,
    showHhHl: false,
    showLiquidityLevels: false,
    showMarketStructure: false,
    showOrderBlocks: true,
    showOrderBlocksH1: true,
    showOrderBlocksM15: false,
    showQuickAnalysisSummary: true,
    showRejectionZones: false,
    showRiskRewardBox: true,
    showRsi: false,
    showScenarioAnalysis: true,
    showStopLoss: true,
    showTakeProfit: true,
    showTradeLevels: true,
    showTrendline: false,
  };
}

function loadSavedChartHeight() {
  if (typeof window === "undefined") {
    return CHART_HEIGHTS.normal;
  }

  const saved = Number(window.localStorage.getItem(CHART_HEIGHT_STORAGE_KEY));
  return clampChartHeight(Number.isFinite(saved) && saved > 0 ? saved : CHART_HEIGHTS.normal);
}

function clampChartHeight(value: number) {
  const viewportMax = typeof window === "undefined" ? 900 : Math.floor(window.innerHeight * 0.9);
  return Math.max(CHART_HEIGHTS.small, Math.min(Math.max(CHART_HEIGHTS.small, viewportMax), Math.round(value)));
}

function ChartSizeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={`h-6 rounded px-2 text-[11px] font-semibold transition ${active ? "bg-amber-200 text-black" : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"}`}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
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

function formatUtcTime(value?: number) {
  if (!value) {
    return "--";
  }

  return new Date(value * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }) + " UTC";
}

function getSyncBadgeClass(status: "SYNC OK" | "PARTIAL SYNC" | "NOT SYNCED") {
  if (status === "SYNC OK") {
    return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  }

  if (status === "PARTIAL SYNC") {
    return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  }

  return "border-rose-300/25 bg-rose-300/10 text-rose-100";
}

function isExnessSource(source: string | null | undefined) {
  if (!source) {
    return false;
  }

  const normalized = source.toLowerCase();
  return normalized.includes("mt5") || normalized.includes("exness") || normalized.includes("bridge");
}

function getTradingViewFallbackSymbol(symbol: string) {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (normalized === "BTCUSD" || normalized === "BTCUSDT") {
    return "BINANCE:BTCUSDT";
  }

  if (normalized === "ETHUSD" || normalized === "ETHUSDT") {
    return "BINANCE:ETHUSDT";
  }

  return null;
}

function getTradingViewInterval(timeframe: Timeframe) {
  const intervals: Record<Timeframe, string> = {
    M1: "1",
    M5: "5",
    M15: "15",
    M30: "30",
    H1: "60",
    H4: "240",
    D1: "D",
  };

  return intervals[timeframe];
}

function isLikelyWeekendClosed(category: SymbolProfile["category"]) {
  if (category === "Crypto") {
    return false;
  }

  const day = new Date().getDay();
  return day === 0 || day === 6;
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
