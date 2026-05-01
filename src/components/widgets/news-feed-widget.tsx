"use client";

import { useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api-base";

interface NewsItem {
  title: string;
  url: string;
  domain: string | null;
  country: string | null;
  publishedAt: string | null;
  summary?: string | null;
}

interface NewsResponse {
  provider?: string;
  results?: NewsItem[];
  error?: string;
}

const DEFAULT_SYMBOLS = ["SPY", "QQQ"];
const REFRESH_MS = 5 * 60 * 1000;

function formatAge(value: string | null): string {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 0) return "";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

export function NewsFeedWidget() {
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [inputValue, setInputValue] = useState("");
  const [items, setItems] = useState<NewsItem[]>([]);
  const [provider, setProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadNews(syms: string[]) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        apiUrl(`/api/news?symbols=${syms.join(",")}&limit=30`),
      );
      const body = (await response.json()) as NewsResponse;
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      setItems(body.results ?? []);
      setProvider(body.provider ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadNews(symbols);
    timerRef.current = setInterval(() => void loadNews(symbols), REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
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
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addSymbol();
    }
    if (e.key === "Escape") setInputValue("");
  }

  return (
    <div className="news-feed">
      <div className="news-feed__toolbar">
        <div className="news-feed__chips">
          {symbols.map((sym) => (
            <span className="news-feed__chip" key={sym}>
              {sym}
              <button
                aria-label={`Remove ${sym}`}
                className="news-feed__chip-remove"
                onClick={() => removeSymbol(sym)}
                type="button"
              >
                ×
              </button>
            </span>
          ))}
          <input
            className="news-feed__symbol-input"
            maxLength={10}
            onChange={(e) => setInputValue(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder="Add ticker…"
            value={inputValue}
          />
        </div>
        <div className="news-feed__meta">
          {provider && (
            <span className="news-feed__provider">{provider.toUpperCase()}</span>
          )}
          <button
            className="news-feed__refresh"
            onClick={() => void loadNews(symbols)}
            title="Refresh"
            type="button"
          >
            ↻
          </button>
        </div>
      </div>

      {loading && <div className="news-feed__state">Loading…</div>}
      {!loading && error && (
        <div className="news-feed__state news-feed__state--error">
          News unavailable
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="news-feed__state">No headlines found</div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="news-feed__list">
          {items.map((item) => (
            <a
              className="news-feed__card"
              href={item.url}
              key={`${item.url}-${item.title}`}
              rel="noreferrer"
              target="_blank"
            >
              <div className="news-feed__card-header">
                {item.country && (
                  <span className="news-feed__card-symbol">{item.country}</span>
                )}
                <span className="news-feed__card-source">
                  {item.domain ?? "Unknown"}
                </span>
                <span className="news-feed__card-age">
                  {formatAge(item.publishedAt)}
                </span>
              </div>
              <div className="news-feed__card-title">{item.title}</div>
              {item.summary && (
                <div className="news-feed__card-summary">{item.summary}</div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
