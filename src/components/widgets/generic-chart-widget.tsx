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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { apiUrl } from "@/lib/api-base";
import { queryData } from "@/lib/data-query";

type RangeKey = "1m" | "3m" | "6m" | "1y" | "5y" | "max";

interface ApiPoint {
  date: string;
  value: number;
}

interface TimeseriesResponse {
  shape?: "timeseries";
  symbol?: string;
  label?: string;
  range?: string;
  results?: ApiPoint[];
}

interface SearchResult {
  symbol: string;
  label: string;
  kind: "macro" | "equity";
}

interface SearchResponse {
  results?: SearchResult[];
}

interface ChartEntry {
  moniker: string;
  label: string;
}

interface PickerOption extends ChartEntry {
  description?: string;
}

interface PickerRow {
  key: string;
  label: string;
  detail: string;
  entry: ChartEntry;
}

type PickerState =
  | {
      kind: "options";
      moniker: string;
      title: string;
      options: PickerOption[];
    }
  | {
      kind: "search";
      moniker: string;
      title: string;
    };

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "1m", label: "1M" },
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "5y", label: "5Y" },
  { key: "max", label: "MAX" },
];

const SERIES_COLORS = [
  "#2196f3",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#14b8a6",
  "#f97316",
  "#ec4899",
];

const MACRO_OPTIONS: PickerOption[] = [
  {
    moniker: "macro.indicators/FEDFUNDS",
    label: "Fed Funds Rate",
    description: "Effective Federal Funds Rate",
  },
  {
    moniker: "macro.indicators/DGS2",
    label: "2Y Treasury",
    description: "2-Year Treasury yield",
  },
  {
    moniker: "macro.indicators/DGS10",
    label: "10Y Treasury",
    description: "10-Year Treasury yield",
  },
  {
    moniker: "macro.indicators/DGS30",
    label: "30Y Treasury",
    description: "30-Year Treasury yield",
  },
  {
    moniker: "macro.indicators/T10Y2Y",
    label: "10Y-2Y Spread",
    description: "Treasury spread",
  },
  {
    moniker: "macro.indicators/CPIAUCSL",
    label: "CPI",
    description: "Consumer Price Index",
  },
  {
    moniker: "macro.indicators/UNRATE",
    label: "Unemployment",
    description: "Unemployment rate",
  },
];

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function canonicalMoniker(moniker: string): string {
  return moniker.trim().replace(/\/date@[^/]*/g, "").replace(/\/filter@[^/]*/g, "");
}

function labelFromMoniker(moniker: string): string {
  const canonical = canonicalMoniker(moniker);
  const pathPart = canonical.split("/").at(-1) ?? canonical;
  return pathPart || canonical;
}

function parseDroppedMoniker(dataTransfer: DataTransfer): string | null {
  const raw =
    dataTransfer.getData("application/x-workbench-moniker") ||
    dataTransfer.getData("text/plain");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { path?: unknown };
    if (typeof parsed.path === "string") return parsed.path.trim() || null;
  } catch {
    // Plain-text drops are accepted below.
  }

  return raw.trim() || null;
}

function parseEntries(raw: string | undefined): ChartEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<Partial<ChartEntry>>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => ({
        moniker: typeof entry.moniker === "string" ? entry.moniker.trim() : "",
        label: typeof entry.label === "string" ? entry.label.trim() : "",
      }))
      .filter((entry) => entry.moniker)
      .map((entry) => ({
        ...entry,
        label: entry.label || labelFromMoniker(entry.moniker),
      }));
  } catch {
    return raw
      .split(",")
      .map((moniker) => moniker.trim())
      .filter(Boolean)
      .map((moniker) => ({ moniker, label: labelFromMoniker(moniker) }));
  }
}

function serializeEntries(entries: ChartEntry[]): string {
  return JSON.stringify(
    entries.map(({ moniker, label }) => ({
      moniker,
      label,
    })),
  );
}

function normalizeToPercent(points: ApiPoint[]): SingleValueData<Time>[] {
  if (!points.length) return [];
  const base = points[0]?.value;
  if (!base) {
    return points.map((point) => ({
      time: point.date as Time,
      value: point.value,
    }));
  }

  return points.map((point) => ({
    time: point.date as Time,
    value: Number((((point.value - base) / base) * 100).toFixed(4)),
  }));
}

function formatPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function pickerForMoniker(moniker: string): PickerState | null {
  const canonical = canonicalMoniker(moniker);
  if (canonical === "macro.indicators") {
    return {
      kind: "options",
      moniker: canonical,
      title: "Macro indicators",
      options: MACRO_OPTIONS,
    };
  }

  if (canonical === "equity.prices" || canonical === "prices.equity") {
    return {
      kind: "search",
      moniker: canonical,
      title: "Equity prices",
    };
  }

  return null;
}

function entryForMoniker(moniker: string): ChartEntry | null {
  const canonical = canonicalMoniker(moniker);
  const equity = canonical.match(/^(?:equity\.prices|prices\.equity)\/([^/]+)$/);
  if (equity?.[1]) {
    const symbol = equity[1].toUpperCase();
    return { moniker: `equity.prices/${symbol}`, label: symbol };
  }

  const macro = canonical.match(/^macro\.indicators\/([^/]+)$/);
  if (macro?.[1]) {
    const symbol = macro[1].toUpperCase();
    const option = MACRO_OPTIONS.find((item) => item.moniker.endsWith(`/${symbol}`));
    return {
      moniker: `macro.indicators/${symbol}`,
      label: option?.label ?? symbol,
    };
  }

  const pnl = canonical.match(/^portfolio\.position\/([^/]+)\/pnl-history$/);
  if (pnl?.[1]) {
    return { moniker: canonical, label: `${pnl[1]} P&L` };
  }

  return null;
}

function searchResultToEntry(result: SearchResult): ChartEntry {
  return result.kind === "macro"
    ? {
        moniker: `macro.indicators/${result.symbol.toUpperCase()}`,
        label: result.label || result.symbol.toUpperCase(),
      }
    : {
        moniker: `equity.prices/${result.symbol.toUpperCase()}`,
        label: result.symbol.toUpperCase(),
      };
}

function isProbablyTicker(value: string): boolean {
  return /^[A-Z.=-]{1,12}$/.test(value.trim().toUpperCase());
}

export function GenericChartWidget({
  moniker,
  seriesConfig,
  onConfigChange,
}: {
  moniker?: string;
  seriesConfig?: string;
  onConfigChange?: (config: Record<string, string>) => void;
} = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pickerListRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesApisRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const lastProcessedMonikerRef = useRef<string>("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [range, setRange] = useState<RangeKey>("1y");
  const [entries, setEntries] = useState<ChartEntry[]>(() =>
    parseEntries(seriesConfig),
  );
  const [dataMap, setDataMap] = useState<
    Record<string, SingleValueData<Time>[]>
  >({});
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [activePickerIndex, setActivePickerIndex] = useState(-1);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    setEntries(parseEntries(seriesConfig));
  }, [seriesConfig]);

  const coloredEntries = useMemo(
    () =>
      entries.map((entry, index) => ({
        ...entry,
        color: SERIES_COLORS[index % SERIES_COLORS.length],
      })),
    [entries],
  );

  const commitEntries = useCallback(
    (nextEntries: ChartEntry[], activeMoniker?: string) => {
      setEntries(nextEntries);
      onConfigChange?.({
        chartSeries: serializeEntries(nextEntries),
        moniker:
          activeMoniker ??
          nextEntries[nextEntries.length - 1]?.moniker ??
          "",
      });
    },
    [onConfigChange],
  );

  const addEntry = useCallback(
    (entry: ChartEntry) => {
      setNotice("");
      setPicker(null);
      setPickerQuery("");
      setActivePickerIndex(-1);
      setIsSearchLoading(false);
      setSearchResults([]);
      const exists = entries.some((item) => item.moniker === entry.moniker);
      const nextEntries = exists ? entries : [...entries, entry];
      commitEntries(nextEntries, entry.moniker);
    },
    [commitEntries, entries],
  );

  const handleIncomingMoniker = useCallback(
    (incomingMoniker: string) => {
      const normalized = incomingMoniker.trim();
      if (!normalized) return;
      lastProcessedMonikerRef.current = normalized;

      const nextPicker = pickerForMoniker(normalized);
      if (nextPicker) {
        setNotice("");
        setPicker(nextPicker);
        setPickerQuery("");
        setActivePickerIndex(-1);
        setIsSearchLoading(false);
        setSearchResults([]);
        onConfigChange?.({ moniker: canonicalMoniker(normalized) });
        return;
      }

      const entry = entryForMoniker(normalized);
      if (entry) {
        addEntry(entry);
        return;
      }

      setPicker(null);
      setActivePickerIndex(-1);
      setNotice(`No chart route for ${normalized}`);
      onConfigChange?.({ moniker: normalized });
    },
    [addEntry, onConfigChange],
  );

  useEffect(() => {
    const normalized = moniker?.trim();
    if (!normalized || normalized === lastProcessedMonikerRef.current) return;
    handleIncomingMoniker(normalized);
  }, [handleIncomingMoniker, moniker]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const readTheme = () => ({
      foreground: cssVar("--foreground", "#17202e"),
      muted: cssVar("--muted", "#5d708c"),
      background: cssVar("--panel-background", "#ffffff"),
      border: cssVar("--panel-border-subtle", "#e2eaf4"),
    });

    const theme = readTheme();
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: theme.background },
        textColor: theme.muted,
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        horzLines: { color: theme.border },
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
        horzLine: { color: theme.muted, labelBackgroundColor: theme.foreground },
        vertLine: { color: theme.muted, labelBackgroundColor: theme.foreground },
      },
    });

    chartRef.current = chart;

    const themeObserver = new MutationObserver(() => {
      const nextTheme = readTheme();
      chart.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: nextTheme.background },
          textColor: nextTheme.muted,
        },
        grid: {
          horzLines: { color: nextTheme.border },
          vertLines: { color: "transparent" },
        },
        crosshair: {
          horzLine: {
            color: nextTheme.muted,
            labelBackgroundColor: nextTheme.foreground,
          },
          vertLine: {
            color: nextTheme.muted,
            labelBackgroundColor: nextTheme.foreground,
          },
        },
      });
    });
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
      seriesApisRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!entries.length) {
      setDataMap({});
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadSeries() {
      setIsLoading(true);
      const nextData: Record<string, SingleValueData<Time>[]> = {};
      const failures: string[] = [];

      await Promise.all(
        entries.map(async (entry) => {
          try {
            const body = await queryData<TimeseriesResponse>({
              moniker: entry.moniker,
              shape: "timeseries",
              params: { range },
            });
            nextData[entry.moniker] = normalizeToPercent(body.results ?? []);
          } catch {
            failures.push(entry.label || entry.moniker);
          }
        }),
      );

      if (!cancelled) {
        setDataMap(nextData);
        setIsLoading(false);
        setNotice(
          failures.length ? `Unavailable: ${failures.join(", ")}` : "",
        );
      }
    }

    void loadSeries();
    return () => {
      cancelled = true;
    };
  }, [entries, range]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const apisMap = seriesApisRef.current;
    const entryMonikers = new Set(entries.map((entry) => entry.moniker));

    for (const [entryMoniker, api] of apisMap) {
      if (!entryMonikers.has(entryMoniker)) {
        chart.removeSeries(api);
        apisMap.delete(entryMoniker);
      }
    }

    for (const entry of coloredEntries) {
      const points = dataMap[entry.moniker];
      if (!points?.length) continue;
      let api = apisMap.get(entry.moniker);
      if (!api) {
        api = chart.addSeries(LineSeries, {
          color: entry.color,
          lineWidth: 2,
          priceFormat: {
            type: "custom",
            formatter: (value: number) => formatPct(value),
          },
        });
        apisMap.set(entry.moniker, api);
      }
      api.applyOptions({ color: entry.color });
      api.setData(points);
    }

    chart.timeScale().fitContent();
  }, [coloredEntries, dataMap, entries]);

  useEffect(() => {
    if (!picker || picker.kind !== "search") {
      setSearchResults([]);
      setActivePickerIndex(-1);
      setIsSearchLoading(false);
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    const query = pickerQuery.trim();
    if (!query) {
      setSearchResults([]);
      setActivePickerIndex(-1);
      setIsSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchResults([]);
    setIsSearchLoading(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          apiUrl(`/api/data/search?q=${encodeURIComponent(query)}`),
        );
        if (!response.ok) {
          if (!cancelled) {
            setSearchResults([]);
            setIsSearchLoading(false);
          }
          return;
        }
        const body = (await response.json()) as SearchResponse;
        if (!cancelled) {
          setSearchResults(
            (body.results ?? []).filter((result) => result.kind === "equity"),
          );
        }
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setIsSearchLoading(false);
      }
    }, 80);

    return () => {
      cancelled = true;
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [picker, pickerQuery]);

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (
      !event.dataTransfer.types.includes("application/x-workbench-moniker") &&
      !event.dataTransfer.types.includes("text/plain")
    ) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const dropped = parseDroppedMoniker(event.dataTransfer);
    if (dropped) handleIncomingMoniker(dropped);
  }

  function removeEntry(monikerToRemove: string) {
    const nextEntries = entries.filter(
      (entry) => entry.moniker !== monikerToRemove,
    );
    commitEntries(nextEntries);
  }

  function submitSearch() {
    const query = pickerQuery.trim().toUpperCase();
    if (!query || !isProbablyTicker(query)) return;
    addEntry({ moniker: `equity.prices/${query}`, label: query });
  }

  const filteredOptions = useMemo(
    () =>
      picker?.kind === "options"
        ? picker.options.filter((option) => {
            const normalizedQuery = pickerQuery.trim().toLowerCase();
            if (!normalizedQuery) return true;
            return `${option.label} ${option.moniker} ${option.description ?? ""}`
              .toLowerCase()
              .includes(normalizedQuery);
          })
        : [],
    [picker, pickerQuery],
  );
  const directTicker =
    picker?.kind === "search" && isProbablyTicker(pickerQuery)
      ? pickerQuery.trim().toUpperCase()
      : "";
  const hasDirectTickerResult = searchResults.some(
    (result) => result.symbol.toUpperCase() === directTicker,
  );
  const pickerRows = useMemo<PickerRow[]>(() => {
    if (!picker) return [];

    if (picker.kind === "options") {
      return filteredOptions.map((option) => ({
        key: option.moniker,
        label: option.label,
        detail: option.moniker,
        entry: option,
      }));
    }

    const resultRows = searchResults.map((result) => ({
      key: `${result.kind}-${result.symbol}`,
      label: result.symbol.toUpperCase(),
      detail: result.label,
      entry: searchResultToEntry(result),
    }));
    const directRow =
      directTicker && !hasDirectTickerResult
        ? {
            key: `direct-${directTicker}`,
            label: directTicker,
            detail: `equity.prices/${directTicker}`,
            entry: {
              moniker: `equity.prices/${directTicker}`,
              label: directTicker,
            },
          }
        : null;

    return resultRows.length > 0
      ? [...resultRows, ...(directRow ? [directRow] : [])]
      : directRow
        ? [directRow]
        : [];
  }, [
    directTicker,
    filteredOptions,
    hasDirectTickerResult,
    picker,
    searchResults,
  ]);

  useEffect(() => {
    if (activePickerIndex < 0) return;
    if (!pickerRows.length) {
      setActivePickerIndex(-1);
      return;
    }
    if (activePickerIndex >= pickerRows.length) {
      setActivePickerIndex(pickerRows.length - 1);
    }
  }, [activePickerIndex, pickerRows.length]);

  function closePicker() {
    setPicker(null);
    setActivePickerIndex(-1);
    setIsSearchLoading(false);
  }

  function focusPickerRow(index: number) {
    window.requestAnimationFrame(() => {
      const button = pickerListRef.current?.querySelector<HTMLButtonElement>(
        `button[data-picker-index="${index}"]`,
      );
      button?.focus({ preventScroll: true });
      button?.scrollIntoView({ block: "nearest" });
    });
  }

  function selectPickerRow(index: number) {
    const row = pickerRows[index];
    if (!row) return;
    addEntry(row.entry);
  }

  function handlePickerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowDown") {
      if (!pickerRows.length) return;
      event.preventDefault();
      const nextIndex = Math.min(activePickerIndex + 1, pickerRows.length - 1);
      setActivePickerIndex(nextIndex);
      focusPickerRow(nextIndex);
      return;
    }

    if (event.key === "ArrowUp") {
      if (!pickerRows.length) return;
      event.preventDefault();
      const nextIndex = Math.max(activePickerIndex - 1, 0);
      setActivePickerIndex(nextIndex);
      focusPickerRow(nextIndex);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (activePickerIndex >= 0) {
        selectPickerRow(activePickerIndex);
        return;
      }
      if (picker?.kind === "search") {
        submitSearch();
        return;
      }
      selectPickerRow(0);
      return;
    }

    if (event.key === "Escape") closePicker();
  }

  return (
    <div
      className="generic-chart"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="generic-chart__toolbar">
        <div className="generic-chart__mode">Indexed %</div>
        <div className="generic-chart__ranges" aria-label="Range">
          {RANGES.map((rangeOption) => (
            <button
              className={[
                "generic-chart__btn",
                rangeOption.key === range ? "generic-chart__btn--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={rangeOption.key}
              onClick={() => setRange(rangeOption.key)}
              type="button"
            >
              {rangeOption.label}
            </button>
          ))}
        </div>
      </div>

      {picker && (
        <div className="generic-chart__picker">
          <div className="generic-chart__picker-head">
            <strong>{picker.title}</strong>
            <span>{picker.moniker}</span>
            <button
              aria-label="Close series picker"
              className="generic-chart__picker-close"
              onClick={closePicker}
              type="button"
            >
              ×
            </button>
          </div>
          <div className="generic-chart__picker-search">
            <input
              aria-label="Search chart series"
              autoFocus
              onChange={(event) => {
                setPickerQuery(event.target.value);
                setActivePickerIndex(-1);
              }}
              onKeyDown={handlePickerKeyDown}
              placeholder={
                picker.kind === "search" ? "Type ticker" : "Search series"
              }
              value={pickerQuery}
            />
          </div>
          <div
            aria-label="Chart series results"
            className="generic-chart__picker-list"
            onKeyDown={handlePickerKeyDown}
            ref={pickerListRef}
            role="listbox"
          >
            {pickerRows.map((row, index) => (
              <button
                aria-selected={index === activePickerIndex}
                data-active={index === activePickerIndex ? "true" : undefined}
                data-picker-index={index}
                key={row.key}
                onClick={() => addEntry(row.entry)}
                onFocus={() => setActivePickerIndex(index)}
                role="option"
                type="button"
              >
                <span>{row.label}</span>
                <code>{row.detail}</code>
              </button>
            ))}
            {picker.kind === "search" &&
              pickerQuery.trim() &&
              !directTicker &&
              searchResults.length === 0 && (
                <div className="generic-chart__picker-empty">
                  {isSearchLoading ? "Searching..." : "No equity matches"}
                </div>
              )}
            {picker.kind === "search" &&
              pickerQuery.trim() &&
              directTicker &&
              isSearchLoading && (
                <div className="generic-chart__picker-empty">
                  Searching...
                </div>
              )}
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <div className="generic-chart__legend">
          {coloredEntries.map((entry) => (
            <span className="generic-chart__chip" key={entry.moniker}>
              <span
                className="generic-chart__dot"
                style={{ background: entry.color }}
              />
              <span className="generic-chart__chip-label">{entry.label}</span>
              <button
                aria-label={`Remove ${entry.label}`}
                className="generic-chart__remove"
                onClick={() => removeEntry(entry.moniker)}
                type="button"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="generic-chart__chart-wrap">
        <div className="generic-chart__chart" ref={containerRef} />
        {(isLoading || entries.length === 0 || notice) && (
          <div className="generic-chart__state">
            {isLoading
              ? "Loading"
              : notice || "Drop a chartable moniker"}
          </div>
        )}
      </div>
    </div>
  );
}
