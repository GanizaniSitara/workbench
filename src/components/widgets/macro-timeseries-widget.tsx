"use client";

import {
  AreaSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type SingleValueData,
  type Time,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { queryData } from "@/lib/data-query";

type RangeKey = "1m" | "3m" | "6m" | "1y" | "5y" | "max";
type SeriesSymbol =
  | "DGS10"
  | "DGS2"
  | "T10Y2Y"
  | "FEDFUNDS"
  | "UNRATE"
  | "CPIAUCSL";

interface ApiPoint {
  date: string;
  value: number;
}

interface SeriesResponse {
  shape?: "timeseries";
  symbol?: SeriesSymbol;
  label?: string;
  format?: "percent" | "level";
  range?: string;
  results?: ApiPoint[];
  error?: string;
}

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "1m", label: "1M" },
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "5y", label: "5Y" },
  { key: "max", label: "MAX" },
];

const SERIES: Array<{ symbol: SeriesSymbol; label: string }> = [
  { symbol: "DGS10", label: "10Y" },
  { symbol: "DGS2", label: "2Y" },
  { symbol: "T10Y2Y", label: "10Y-2Y" },
  { symbol: "FEDFUNDS", label: "Fed Funds" },
  { symbol: "UNRATE", label: "Unemployment" },
  { symbol: "CPIAUCSL", label: "CPI" },
];

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function formatValue(value: number, format: SeriesResponse["format"]): string {
  if (format === "level") {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(value);
  }
  return `${value.toFixed(2)}%`;
}

export function MacroTimeseriesWidget({
  moniker: monikerProp,
}: {
  moniker?: string;
} = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [range, setRange] = useState<RangeKey>("3m");
  const [symbol, setSymbol] = useState<SeriesSymbol>("DGS10");
  const [data, setData] = useState<SingleValueData<Time>[]>([]);
  const [meta, setMeta] = useState<SeriesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const moniker = useMemo(
    () => monikerProp ?? "macro.indicators",
    [monikerProp],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadSeries() {
      setIsLoading(true);
      setError(null);
      try {
        const body = await queryData<SeriesResponse>({
          moniker,
          shape: "timeseries",
          params: { symbol, range },
        });
        const points = (body.results ?? []).map((point) => ({
          time: point.date as Time,
          value: point.value,
        }));
        if (!cancelled) {
          setData(points);
          setMeta(body);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadSeries();
    return () => {
      cancelled = true;
    };
  }, [range, symbol, moniker]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const readThemeColors = () => ({
      foreground: cssVar("--foreground", "#17202e"),
      muted: cssVar("--muted", "#5d708c"),
      accent: cssVar("--accent", "#0067b8"),
      panelBackground: cssVar("--panel-background", "#ffffff"),
      panelBorder: cssVar("--panel-border-subtle", "#e2eaf4"),
    });

    const initial = readThemeColors();

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: initial.panelBackground },
        textColor: initial.muted,
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 11,
      },
      grid: {
        horzLines: { color: initial.panelBorder },
        vertLines: { color: "transparent" },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        secondsVisible: false,
        timeVisible: false,
      },
      crosshair: {
        horzLine: {
          color: initial.muted,
          labelBackgroundColor: initial.foreground,
        },
        vertLine: {
          color: initial.muted,
          labelBackgroundColor: initial.foreground,
        },
      },
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: initial.accent,
      lineWidth: 2,
      topColor: `${initial.accent}55`,
      bottomColor: `${initial.accent}05`,
      priceFormat: {
        type: "custom",
        formatter: (price: number) => formatValue(price, meta?.format),
      },
    });

    chartRef.current = chart;
    seriesRef.current = areaSeries;

    const applyThemeColors = () => {
      const c = readThemeColors();
      chart.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: c.panelBackground },
          textColor: c.muted,
        },
        grid: {
          horzLines: { color: c.panelBorder },
          vertLines: { color: "transparent" },
        },
        crosshair: {
          horzLine: { color: c.muted, labelBackgroundColor: c.foreground },
          vertLine: { color: c.muted, labelBackgroundColor: c.foreground },
        },
      });
      areaSeries.applyOptions({
        lineColor: c.accent,
        topColor: `${c.accent}55`,
        bottomColor: `${c.accent}05`,
      });
    };

    const themeObserver = new MutationObserver(applyThemeColors);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const resizeObserver = new ResizeObserver(() => {
      chart.timeScale().fitContent();
    });
    resizeObserver.observe(container);

    return () => {
      themeObserver.disconnect();
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [meta?.format]);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    seriesRef.current.setData(data);
    chartRef.current.timeScale().fitContent();
  }, [data]);

  const latest = useMemo(() => data[data.length - 1]?.value ?? null, [data]);

  return (
    <div className="macro-timeseries">
      <div className="macro-timeseries__toolbar">
        <div className="macro-timeseries__series" aria-label="Series">
          {SERIES.map((item) => (
            <button
              className={
                item.symbol === symbol
                  ? "macro-timeseries__btn macro-timeseries__btn--active"
                  : "macro-timeseries__btn"
              }
              key={item.symbol}
              onClick={() => setSymbol(item.symbol)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="macro-timeseries__ranges" aria-label="Range">
          {RANGES.map((item) => (
            <button
              className={
                item.key === range
                  ? "macro-timeseries__btn macro-timeseries__btn--active"
                  : "macro-timeseries__btn"
              }
              key={item.key}
              onClick={() => setRange(item.key)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="macro-timeseries__summary">
        <span>{meta?.label ?? symbol}</span>
        <strong>
          {latest === null ? "-" : formatValue(latest, meta?.format)}
        </strong>
        <span>{meta?.range ?? range}</span>
      </div>
      <div className="macro-timeseries__chart-wrap">
        <div className="macro-timeseries__chart" ref={containerRef} />
        {(isLoading || error || data.length === 0) && (
          <div className="macro-timeseries__state">
            {isLoading
              ? "Loading chart"
              : error
                ? "Chart data unavailable"
                : "No chart data"}
          </div>
        )}
      </div>
    </div>
  );
}
