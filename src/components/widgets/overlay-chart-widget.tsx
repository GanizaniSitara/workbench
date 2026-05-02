"use client";

import {
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type SingleValueData,
  type Time,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { queryData } from "@/lib/data-query";
import { apiUrl } from "@/lib/api-base";

type RangeKey = "1m" | "3m" | "6m" | "1y" | "5y" | "max";
type SeriesKind = "macro" | "equity";

interface ApiPoint {
  date: string;
  value: number;
}

interface DataResponse {
  results?: ApiPoint[];
  error?: string;
}

interface SearchResult {
  symbol: string;
  label: string;
  kind: SeriesKind;
}

interface SearchResponse {
  results?: SearchResult[];
}

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "1m", label: "1M" },
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "5y", label: "5Y" },
  { key: "max", label: "MAX" },
];

const SERIES_COLORS = [
  "#0067b8",
  "#e84040",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#14b8a6",
  "#f97316",
  "#ec4899",
];

function normalizeToPercent(points: ApiPoint[]): SingleValueData<Time>[] {
  if (!points.length) return [];
  const base = points[0].value;
  if (!base) return [];
  return points.map((p) => ({
    time: p.date as Time,
    value: Number((((p.value - base) / base) * 100).toFixed(4)),
  }));
}

function formatPct(v: number): string {
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

interface SeriesEntry {
  id: string;
  symbol: string;
  label: string;
  kind: SeriesKind;
  color: string;
}

function cssVar(name: string, fallback: string): string {
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return val || fallback;
}

export function OverlayChartWidget() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesApisRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [range, setRange] = useState<RangeKey>("1y");
  const [entries, setEntries] = useState<SeriesEntry[]>([]);
  const [dataMap, setDataMap] = useState<Record<string, SingleValueData<Time>[]>>({});
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Init chart once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const readTheme = () => ({
      fg: cssVar("--foreground", "#17202e"),
      muted: cssVar("--muted", "#5d708c"),
      bg: cssVar("--panel-background", "#ffffff"),
      border: cssVar("--panel-border-subtle", "#e2eaf4"),
    });

    const t = readTheme();
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: t.bg },
        textColor: t.muted,
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        horzLines: { color: t.border },
        vertLines: { color: "transparent" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        secondsVisible: false,
        timeVisible: false,
      },
      crosshair: {
        horzLine: { color: t.muted, labelBackgroundColor: t.fg },
        vertLine: { color: t.muted, labelBackgroundColor: t.fg },
      },
    });
    chartRef.current = chart;

    const themeObserver = new MutationObserver(() => {
      const c = readTheme();
      chart.applyOptions({
        layout: { background: { type: ColorType.Solid, color: c.bg }, textColor: c.muted },
        grid: { horzLines: { color: c.border }, vertLines: { color: "transparent" } },
        crosshair: {
          horzLine: { color: c.muted, labelBackgroundColor: c.fg },
          vertLine: { color: c.muted, labelBackgroundColor: c.fg },
        },
      });
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const resizeObserver = new ResizeObserver(() => chart.timeScale().fitContent());
    resizeObserver.observe(container);

    return () => {
      themeObserver.disconnect();
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesApisRef.current.clear();
    };
  }, []);

  // Fetch all entries when entries or range changes
  useEffect(() => {
    if (!entries.length) return;
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);
      const results: Record<string, SingleValueData<Time>[]> = {};

      await Promise.all(
        entries.map(async (entry) => {
          try {
            const body =
              entry.kind === "macro"
                ? await queryData<DataResponse>({
                    moniker: "macro.indicators",
                    shape: "timeseries",
                    params: { symbol: entry.symbol, range },
                  })
                : await queryData<DataResponse>({
                    moniker: `equity.prices/${entry.symbol}`,
                    shape: "timeseries",
                    params: { range },
                  });
            if (!body.error) {
              results[entry.id] = normalizeToPercent(body.results ?? []);
            }
          } catch {
            // silently skip failed series
          }
        }),
      );

      if (!cancelled) {
        setDataMap(results);
        setLoading(false);
      }
    }

    void fetchAll();
    return () => {
      cancelled = true;
    };
  }, [entries, range]);

  // Sync series refs to chart
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const apisMap = seriesApisRef.current;
    const entryIds = new Set(entries.map((e) => e.id));

    for (const [id, api] of apisMap) {
      if (!entryIds.has(id)) {
        chart.removeSeries(api);
        apisMap.delete(id);
      }
    }

    for (const entry of entries) {
      const points = dataMap[entry.id];
      if (!points?.length) continue;
      let api = apisMap.get(entry.id);
      if (!api) {
        api = chart.addSeries(LineSeries, {
          color: entry.color,
          lineWidth: 2,
          priceFormat: {
            type: "custom",
            formatter: (v: number) => formatPct(v),
          },
        });
        apisMap.set(entry.id, api);
      }
      api.setData(points);
    }

    chart.timeScale().fitContent();
  }, [dataMap, entries]);

  // Debounced search as user types
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    const q = inputValue.trim();
    if (!q) {
      setSuggestions([]);
      setDropdownOpen(false);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSuggestions([]);
    setActiveIndex(-1);
    setDropdownOpen(true);
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(apiUrl(`/api/data/search?q=${encodeURIComponent(q)}`));
        if (res.ok) {
          const body = (await res.json()) as SearchResponse;
          if (!cancelled) {
            setSuggestions(body.results ?? []);
            setDropdownOpen(true);
            setActiveIndex(-1);
          }
        } else if (!cancelled) {
          setSuggestions([]);
        }
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 80);

    return () => {
      cancelled = true;
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [inputValue]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function addEntry(result: SearchResult) {
    if (entries.some((e) => e.symbol === result.symbol)) {
      setInputValue("");
      setDropdownOpen(false);
      return;
    }
    const id = `${result.symbol}-${Date.now()}`;
    const color = SERIES_COLORS[entries.length % SERIES_COLORS.length];
    setEntries((prev) => [...prev, { id, symbol: result.symbol, label: result.label, kind: result.kind, color }]);
    setInputValue("");
    setDropdownOpen(false);
    setSuggestions([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!dropdownOpen || !suggestions.length) {
      if (e.key === "Escape") {
        setDropdownOpen(false);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = activeIndex >= 0 ? suggestions[activeIndex] : suggestions[0];
      if (target) addEntry(target);
    } else if (e.key === "Escape") {
      setDropdownOpen(false);
    }
  }

  function handleRemove(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setDataMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  return (
    <div className="macro-timeseries">
      <div className="macro-timeseries__toolbar">
        <div className="overlay-chart__search" ref={dropdownRef}>
          <div className="macro-timeseries__series">
            <input
              aria-autocomplete="list"
              aria-expanded={dropdownOpen}
              aria-label="Search symbol to overlay"
              autoComplete="off"
              className="macro-timeseries__btn"
              maxLength={20}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search ticker or series…"
              style={{ width: "10rem" }}
              type="text"
              value={inputValue}
            />
          </div>
          {dropdownOpen && (suggestions.length > 0 || searching) && (
            <ul className="overlay-chart__dropdown" role="listbox">
              {searching && suggestions.length === 0 && (
                <li className="overlay-chart__dropdown-empty">
                  Searching...
                </li>
              )}
              {suggestions.map((s, i) => (
                <li
                  className={[
                    "overlay-chart__dropdown-item",
                    i === activeIndex ? "overlay-chart__dropdown-item--active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={`${s.symbol}-${s.kind}`}
                  onMouseDown={() => addEntry(s)}
                  role="option"
                  aria-selected={i === activeIndex}
                >
                  <span className="overlay-chart__dropdown-symbol">{s.symbol}</span>
                  <span className="overlay-chart__dropdown-label">{s.label}</span>
                  <span className={`overlay-chart__dropdown-kind overlay-chart__dropdown-kind--${s.kind}`}>
                    {s.kind === "macro" ? "FRED" : "EQ"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="macro-timeseries__ranges" aria-label="Range">
          {RANGES.map((r) => (
            <button
              className={
                r.key === range
                  ? "macro-timeseries__btn macro-timeseries__btn--active"
                  : "macro-timeseries__btn"
              }
              key={r.key}
              onClick={() => setRange(r.key)}
              type="button"
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {entries.length > 0 && (
        <div className="overlay-chart__legend">
          {entries.map((entry) => (
            <span className="overlay-chart__chip" key={entry.id}>
              <span className="overlay-chart__dot" style={{ background: entry.color }} />
              {entry.symbol}
              <button
                aria-label={`Remove ${entry.symbol}`}
                className="overlay-chart__remove"
                onClick={() => handleRemove(entry.id)}
                type="button"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="macro-timeseries__chart-wrap">
        <div className="macro-timeseries__chart" ref={containerRef} />
        {(loading || entries.length === 0) && (
          <div className="macro-timeseries__state">
            {entries.length === 0
              ? "Search a ticker or FRED series to compare"
              : "Loading…"}
          </div>
        )}
      </div>
    </div>
  );
}
