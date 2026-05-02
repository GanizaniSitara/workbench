"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-base";
import {
  newsApiPath,
  newsMonikerFromSymbols,
  symbolsFromNewsMoniker,
} from "@/lib/news-moniker";

interface NewsItem {
  title: string;
  url: string;
  domain: string | null;
  country: string | null;
  publishedAt: string | null;
}

interface NewsResponse {
  provider?: string;
  results?: NewsItem[];
  error?: string;
}

interface SymbolRow {
  symbol: string;
  headlines: NewsItem[];
}

const DEFAULT_SYMBOLS = ["AAPL", "MSFT", "NVDA", "SPY"];

function ageMinutes(value: string | null): number {
  if (!value) return Infinity;
  return Math.floor((Date.now() - new Date(value).getTime()) / 60_000);
}

function formatAge(minutes: number): string {
  if (!Number.isFinite(minutes)) return "—";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

type HeatLevel = "none" | "low" | "medium" | "high";

function heatLevel(count: number): HeatLevel {
  if (count === 0) return "none";
  if (count <= 2) return "low";
  if (count <= 5) return "medium";
  return "high";
}

export function EventContextWidget({
  moniker = "news.company/AAPL,MSFT,NVDA,SPY",
  onMonikerChange,
}: {
  moniker?: string;
  onMonikerChange?: (moniker: string) => void;
} = {}) {
  const [symbols, setSymbols] = useState<string[]>(() =>
    symbolsFromNewsMoniker(moniker, DEFAULT_SYMBOLS),
  );
  const [inputValue, setInputValue] = useState("");
  const [rows, setRows] = useState<SymbolRow[]>([]);
  const [provider, setProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (symbols.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const response = await fetch(apiUrl(newsApiPath(moniker, symbols, 50)));
        const body = (await response.json()) as NewsResponse;
        if (!response.ok)
          throw new Error(body.error ?? `HTTP ${response.status}`);
        if (cancelled) return;

        const prov = body.provider ?? null;
        setProvider(prov);

        const items = body.results ?? [];
        const isSymbolLinked =
          prov === "openbb-yfinance" || prov?.includes("openbb");

        const grouped: Record<string, NewsItem[]> = {};
        for (const sym of symbols) grouped[sym] = [];

        if (isSymbolLinked) {
          for (const item of items) {
            const sym = item.country?.toUpperCase();
            if (sym && grouped[sym]) grouped[sym].push(item);
          }
        } else {
          // GDELT: distribute headlines to all watched symbols uniformly
          for (const sym of symbols) grouped[sym] = items;
        }

        const nextRows = symbols.map((sym) => ({
          symbol: sym,
          headlines: [...(grouped[sym] ?? [])].sort((a, b) =>
            String(b.publishedAt ?? "").localeCompare(
              String(a.publishedAt ?? ""),
            ),
          ),
        }));

        setRows(nextRows);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [symbols]);

  useEffect(() => {
    setSymbols(symbolsFromNewsMoniker(moniker, DEFAULT_SYMBOLS));
  }, [moniker]);

  function addSymbol() {
    const sym = inputValue.trim().toUpperCase();
    if (!sym || symbols.includes(sym)) {
      setInputValue("");
      return;
    }
    const nextSymbols = [...symbols, sym];
    setSymbols(nextSymbols);
    onMonikerChange?.(newsMonikerFromSymbols(nextSymbols));
    setInputValue("");
  }

  function removeSymbol(sym: string) {
    const nextSymbols = symbols.filter((s) => s !== sym);
    setSymbols(nextSymbols);
    onMonikerChange?.(newsMonikerFromSymbols(nextSymbols));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addSymbol();
    }
    if (e.key === "Escape") setInputValue("");
  }

  return (
    <div className="event-context">
      <div className="event-context__toolbar">
        <div className="event-context__chips">
          {symbols.map((sym) => (
            <span className="event-context__chip" key={sym}>
              {sym}
              <button
                aria-label={`Remove ${sym}`}
                className="event-context__chip-remove"
                onClick={() => removeSymbol(sym)}
                type="button"
              >
                ×
              </button>
            </span>
          ))}
          <input
            className="event-context__symbol-input"
            maxLength={10}
            onChange={(e) => setInputValue(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder="Add ticker…"
            value={inputValue}
          />
        </div>
        {provider && (
          <span className="event-context__provider">
            {provider.toUpperCase()}
          </span>
        )}
      </div>

      {loading && <div className="event-context__state">Loading…</div>}
      {!loading && error && (
        <div className="event-context__state event-context__state--error">
          Unavailable
        </div>
      )}
      {!loading && !error && symbols.length === 0 && (
        <div className="event-context__state">Add tickers to monitor</div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="event-context__list">
          {rows.map((row) => {
            const latest = row.headlines[0] ?? null;
            const recentCount = row.headlines.filter(
              (h) => ageMinutes(h.publishedAt) < 1440,
            ).length;
            const heat = heatLevel(recentCount);
            const age = ageMinutes(latest?.publishedAt ?? null);

            return (
              <div
                className="event-context__row"
                data-heat={heat}
                key={row.symbol}
              >
                <div className="event-context__row-top">
                  <span className="event-context__sym">{row.symbol}</span>
                  <span
                    className={`event-context__heat event-context__heat--${heat}`}
                  >
                    {recentCount} headline{recentCount !== 1 ? "s" : ""}
                  </span>
                  <span className="event-context__age">{formatAge(age)}</span>
                </div>
                {latest ? (
                  <a
                    className="event-context__headline"
                    href={latest.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {latest.title}
                  </a>
                ) : (
                  <span className="event-context__headline event-context__headline--empty">
                    No recent headlines
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
