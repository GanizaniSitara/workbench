"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-base";

interface PricePoint {
  date: string;
  value: number;
}

interface EquityResponse {
  symbol?: string;
  label?: string;
  results?: PricePoint[];
  error?: string;
}

interface NewsItem {
  title: string;
  url: string;
  domain: string | null;
  publishedAt: string | null;
}

interface NewsResponse {
  results?: NewsItem[];
  error?: string;
}

interface SymbolBrief {
  symbol: string;
  label: string | null;
  changePercent: number | null;
  headlines: NewsItem[];
  loading: boolean;
  error: boolean;
}

const DEFAULT_SYMBOLS = ["AAPL", "MSFT"];

function formatChange(pct: number | null): string {
  if (pct === null) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function formatDate(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(d);
}

async function fetchBrief(symbol: string): Promise<Omit<SymbolBrief, "loading" | "error">> {
  const [equityRes, newsRes] = await Promise.all([
    fetch(apiUrl(`/api/market/equity?symbol=${symbol}&range=1m`)),
    fetch(apiUrl(`/api/news?symbols=${symbol}&limit=5`)),
  ]);

  const equity = (await equityRes.json()) as EquityResponse;
  const news = (await newsRes.json()) as NewsResponse;

  const points = equity.results ?? [];
  let changePercent: number | null = null;
  if (points.length >= 2) {
    const first = points[0].value;
    const last = points[points.length - 1].value;
    if (first !== 0) changePercent = ((last - first) / first) * 100;
  }

  const headlines = (news.results ?? [])
    .slice(0, 3)
    .filter((h) => h.title && h.url);

  return {
    symbol,
    label: equity.label ?? null,
    changePercent,
    headlines,
  };
}

export function ResearchPanelWidget() {
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [inputValue, setInputValue] = useState("");
  const [briefs, setBriefs] = useState<Record<string, SymbolBrief>>({});

  useEffect(() => {
    for (const sym of symbols) {
      if (briefs[sym]) continue;
      setBriefs((prev) => ({
        ...prev,
        [sym]: {
          symbol: sym,
          label: null,
          changePercent: null,
          headlines: [],
          loading: true,
          error: false,
        },
      }));

      void fetchBrief(sym)
        .then((result) => {
          setBriefs((prev) => ({
            ...prev,
            [sym]: { ...result, loading: false, error: false },
          }));
        })
        .catch(() => {
          setBriefs((prev) => ({
            ...prev,
            [sym]: {
              symbol: sym,
              label: null,
              changePercent: null,
              headlines: [],
              loading: false,
              error: true,
            },
          }));
        });
    }
  }, [symbols]);

  function addSymbol() {
    const sym = inputValue.trim().toUpperCase();
    if (!sym || symbols.includes(sym)) {
      setInputValue("");
      return;
    }
    setSymbols((prev) => [...prev, sym]);
    setInputValue("");
  }

  function removeSymbol(sym: string) {
    setSymbols((prev) => prev.filter((s) => s !== sym));
    setBriefs((prev) => {
      const next = { ...prev };
      delete next[sym];
      return next;
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addSymbol();
    }
    if (e.key === "Escape") setInputValue("");
  }

  return (
    <div className="research-panel">
      <div className="research-panel__toolbar">
        <div className="research-panel__chips">
          {symbols.map((sym) => (
            <span className="research-panel__chip" key={sym}>
              {sym}
              <button
                aria-label={`Remove ${sym}`}
                className="research-panel__chip-remove"
                onClick={() => removeSymbol(sym)}
                type="button"
              >
                ×
              </button>
            </span>
          ))}
          <input
            className="research-panel__symbol-input"
            maxLength={10}
            onChange={(e) => setInputValue(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder="Add ticker…"
            value={inputValue}
          />
        </div>
      </div>

      {symbols.length === 0 && (
        <div className="research-panel__state">Add tickers to research</div>
      )}

      <div className="research-panel__list">
        {symbols.map((sym) => {
          const brief = briefs[sym];
          if (!brief || brief.loading) {
            return (
              <div className="research-card research-card--loading" key={sym}>
                <div className="research-card__header">
                  <span className="research-card__symbol">{sym}</span>
                </div>
                <div className="research-card__state">Loading…</div>
              </div>
            );
          }
          if (brief.error) {
            return (
              <div className="research-card research-card--error" key={sym}>
                <div className="research-card__header">
                  <span className="research-card__symbol">{sym}</span>
                </div>
                <div className="research-card__state">Data unavailable</div>
              </div>
            );
          }

          const positive =
            brief.changePercent !== null && brief.changePercent >= 0;

          return (
            <div className="research-card" key={sym}>
              <div className="research-card__header">
                <span className="research-card__symbol">{sym}</span>
                {brief.label && (
                  <span className="research-card__label">{brief.label}</span>
                )}
                <span
                  className={[
                    "research-card__change",
                    positive
                      ? "research-card__change--positive"
                      : "research-card__change--negative",
                  ].join(" ")}
                >
                  {formatChange(brief.changePercent)}
                  <span className="research-card__period"> 1m</span>
                </span>
                <button
                  aria-label={`Remove ${sym}`}
                  className="research-card__remove"
                  onClick={() => removeSymbol(sym)}
                  type="button"
                >
                  ×
                </button>
              </div>

              {brief.headlines.length > 0 ? (
                <div className="research-card__headlines">
                  {brief.headlines.map((h) => (
                    <a
                      className="research-card__headline"
                      href={h.url}
                      key={`${h.url}-${h.title}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span className="research-card__headline-title">
                        {h.title}
                      </span>
                      <span className="research-card__headline-meta">
                        {h.domain ?? ""}
                        {h.publishedAt
                          ? ` · ${formatDate(h.publishedAt)}`
                          : ""}
                      </span>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="research-card__state">No recent headlines</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
