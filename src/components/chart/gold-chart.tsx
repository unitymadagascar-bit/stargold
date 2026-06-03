"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Crosshair, Minus, Plus, RotateCcw } from "lucide-react";
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
import type { Candle, Timeframe, TradePlan } from "@/types";
import { timeframes } from "@/lib/mock-data";

export function GoldChart({
  candleMap,
  plan,
}: {
  candleMap: Record<Timeframe, Candle[]>;
  plan: TradePlan;
}) {
  const [timeframe, setTimeframe] = useState<Timeframe>("H1");
  const [ohlc, setOhlc] = useState<Candle | null>(candleMap.H1.at(-1) ?? null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const candles = candleMap[timeframe];
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
      height: 460,
      layout: {
        background: { type: ColorType.Solid, color: "#07090d" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.08)" },
        horzLines: { color: "rgba(148, 163, 184, 0.08)" },
      },
      crosshair: {
        mode: 0,
      },
      rightPriceScale: {
        borderColor: "rgba(148, 163, 184, 0.18)",
      },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.18)",
        rightOffset: 10,
        barSpacing: 8,
        timeVisible: true,
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
      upColor: "#22c55e",
      downColor: "#f43f5e",
      borderUpColor: "#22c55e",
      borderDownColor: "#f43f5e",
      wickUpColor: "#86efac",
      wickDownColor: "#fda4af",
    });

    chart.subscribeCrosshairMove((param) => {
      const item = param.seriesData.get(series) as CandlestickData | undefined;
      if (!item || typeof item.time !== "number") {
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
    if (!series) {
      return;
    }

    series.setData(chartData);
    series.priceLines().forEach((line) => series.removePriceLine(line));
    addPriceLine(series, plan.entry, "#facc15", "Entry");
    addPriceLine(series, plan.stopLoss, "#fb7185", "SL");
    plan.takeProfits.forEach((target, index) => addPriceLine(series, target, "#34d399", `TP${index + 1}`));
    addPriceLine(series, Math.min(...candles.slice(-80).map((candle) => candle.low)), "#38bdf8", "Support");
    addPriceLine(series, Math.max(...candles.slice(-80).map((candle) => candle.high)), "#f59e0b", "Résistance");
    chartRef.current?.timeScale().fitContent();
    setOhlc(candles.at(-1) ?? null);
  }, [candles, chartData, plan.entry, plan.stopLoss, plan.takeProfits]);

  function zoom(factor: number) {
    const timeScale = chartRef.current?.timeScale();
    const range = timeScale?.getVisibleLogicalRange();
    if (!timeScale || !range) {
      return;
    }

    const center = (range.from + range.to) / 2;
    const width = (range.to - range.from) * factor;
    timeScale.setVisibleLogicalRange({ from: center - width / 2, to: center + width / 2 });
  }

  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Graphique GOLD / XAUUSD</h2>
          <p className="mt-1 text-sm text-slate-400">Candlesticks, OHLC, zones clés, entrée, SL et objectifs.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {timeframes.map((item) => (
            <button
              key={item}
              className={`h-9 rounded-md border px-3 text-xs font-semibold ${
                timeframe === item ? "border-amber-300/45 bg-amber-300/15 text-amber-100" : "border-white/10 bg-white/[0.03] text-slate-300"
              }`}
              type="button"
              onClick={() => setTimeframe(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md bg-slate-900/70 px-3 py-2">
        <div className="flex flex-wrap gap-3 font-mono text-xs text-slate-300">
          <span>O {ohlc?.open.toFixed(2)}</span>
          <span>H {ohlc?.high.toFixed(2)}</span>
          <span>L {ohlc?.low.toFixed(2)}</span>
          <span>C {ohlc?.close.toFixed(2)}</span>
          <span>{ohlc ? new Date(ohlc.time * 1000).toLocaleString("fr-FR") : ""}</span>
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

      <div ref={containerRef} className="h-[460px] w-full overflow-hidden rounded-md border border-white/10 bg-[#07090d]" />

      <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-4">
        <Legend color="bg-sky-400" label="Support" />
        <Legend color="bg-amber-400" label="Résistance / liquidité" />
        <Legend color="bg-rose-400" label="Stop loss" />
        <Legend color="bg-emerald-400" label="Take profits" />
      </div>
    </section>
  );
}

function addPriceLine(series: ISeriesApi<"Candlestick">, price: number, color: string, title: string) {
  series.createPriceLine({
    price,
    color,
    lineWidth: 1,
    lineStyle: LineStyle.Dashed,
    axisLabelVisible: true,
    title,
  });
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      className="grid size-9 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-slate-200 transition hover:bg-white/[0.08]"
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
    <div className="flex items-center gap-2 rounded-md bg-slate-900/70 px-3 py-2">
      <span className={`size-2 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  );
}
