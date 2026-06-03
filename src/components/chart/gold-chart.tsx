"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Crosshair, Minus, Plus, RotateCcw, Wifi, WifiOff } from "lucide-react";
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
import type { Candle, LiveConnectionStatus, Timeframe, TradePlan } from "@/types";
import { timeframes } from "@/lib/market/timeframes";

export function GoldChart({
  candleMap,
  connectionMessage,
  connectionStatus,
  onTimeframeChange,
  plan,
  timeframe,
}: {
  candleMap: Record<Timeframe, Candle[]>;
  connectionMessage: string;
  connectionStatus: LiveConnectionStatus;
  onTimeframeChange: (timeframe: Timeframe) => void;
  plan: TradePlan;
  timeframe: Timeframe;
}) {
  const candles = candleMap[timeframe];
  const [ohlc, setOhlc] = useState<Candle | null>(candles.at(-1) ?? null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLineRefs = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[]>([]);
  const previousTimeframeRef = useRef<Timeframe | null>(null);
  const previousLengthRef = useRef(0);
  const latestCandleRef = useRef<Candle | null>(null);

  const latestCandle = candles.at(-1) ?? null;
  latestCandleRef.current = latestCandle;
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
      height: 560,
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
    const series = seriesRef.current;
    if (!series) {
      return;
    }

    for (const line of priceLineRefs.current) {
      series.removePriceLine(line);
    }
    priceLineRefs.current = [];

    addPriceLine(series, priceLineRefs.current, plan.entry, "#facc15", "Entry");
    addPriceLine(series, priceLineRefs.current, plan.stopLoss, "#fb7185", "SL");
    plan.takeProfits.forEach((target, index) => addPriceLine(series, priceLineRefs.current, target, "#34d399", `TP${index + 1}`));

    if (candles.length) {
      addPriceLine(series, priceLineRefs.current, Math.min(...candles.slice(-160).map((candle) => candle.low)), "#38bdf8", "Support");
      addPriceLine(series, priceLineRefs.current, Math.max(...candles.slice(-160).map((candle) => candle.high)), "#f59e0b", "Resistance");
    }
  }, [candles, plan.entry, plan.stopLoss, plan.takeProfits]);

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
    <section className="relative min-h-[680px] rounded-lg border border-white/10 bg-[#0a0d12] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-md bg-amber-300/10 text-amber-200">
            {connectionStatus === "live" ? <Wifi size={18} /> : <WifiOff size={18} />}
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">XAUUSD live chart</h2>
            <p className="text-xs text-slate-400">{connectionMessage}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {timeframes.map((item) => (
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
          ))}
        </div>
      </div>

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

      <div ref={containerRef} className="mt-3 h-[560px] w-full overflow-hidden rounded-md border border-white/10 bg-[#06080c]" />

      {!candles.length ? (
        <div className="pointer-events-none absolute inset-x-6 top-56 rounded-lg border border-amber-300/25 bg-black/80 p-5 text-center shadow-2xl backdrop-blur">
          <p className="text-sm font-semibold text-amber-100">Aucune bougie live reçue</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Configure `NEXT_PUBLIC_XAUUSD_TICK_STREAM_URL` avec ton bridge MT5 ou provider WebSocket/SSE. Le graphique final ne génère plus de bougies mock.
          </p>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-4">
        <Legend color="bg-sky-400" label="Support live" />
        <Legend color="bg-amber-400" label="Resistance / liquidité" />
        <Legend color="bg-rose-400" label="Stop loss" />
        <Legend color="bg-emerald-400" label="Take profits" />
      </div>
    </section>
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
