"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-base";

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

function formatTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(date);
}

export function NewsWidget() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [provider, setProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadNews() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(apiUrl("/api/news"));
        const body = (await response.json()) as NewsResponse;
        if (!response.ok)
          throw new Error(body.error ?? `HTTP ${response.status}`);
        if (!cancelled) {
          setItems(body.results ?? []);
          setProvider(body.provider ?? null);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadNews();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return <div className="news-widget news-widget--state">Loading news</div>;
  }

  if (error) {
    return (
      <div className="news-widget news-widget--state">News unavailable</div>
    );
  }

  return (
    <div className="news-widget">
      <div className="news-widget__meta">
        <span>{provider ? provider.toUpperCase() : "NEWS"}</span>
        <span>{items.length} headlines</span>
      </div>
      <div className="news-widget__list">
        {items.map((item) => (
          <a
            className="news-widget__item"
            href={item.url}
            key={`${item.url}-${item.title}`}
            rel="noreferrer"
            target="_blank"
          >
            <span className="news-widget__title">{item.title}</span>
            <span className="news-widget__source">
              {item.domain ?? "Unknown"}
              {item.publishedAt ? ` · ${formatTime(item.publishedAt)}` : ""}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
