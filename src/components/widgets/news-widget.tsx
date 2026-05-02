"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { queryData } from "@/lib/data-query";

interface NewsItem {
  title: string;
  url: string;
  domain: string | null;
  country: string | null;
  publishedAt: string | null;
}

interface TonePoint {
  date: string;
  value: number;
}

interface NewsSentiment {
  averageTone: number | null;
  latestTone: number | null;
  positive: number;
  neutral: number;
  negative: number;
  trend: "improving" | "deteriorating" | "flat";
  timeline: TonePoint[];
}

interface NewsResponse {
  shape?: "news";
  provider?: string;
  topic?: string;
  source?: string;
  results?: NewsItem[];
  consensus?: NewsSentiment;
  sentiment?: NewsSentiment;
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

function formatTone(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "--";
  return value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

function toneBucket(value: number | null): "positive" | "negative" | "neutral" {
  if (value === null || Math.abs(value) < 1) return "neutral";
  return value > 0 ? "positive" : "negative";
}

function trendLabel(trend: NewsSentiment["trend"]): string {
  if (trend === "improving") return "Improving";
  if (trend === "deteriorating") return "Worsening";
  return "Flat";
}

function ToneChart({ timeline }: { timeline: TonePoint[] }) {
  const points = timeline.slice(-36);
  if (!points.length) return null;

  const maxAbs = Math.max(1, ...points.map((point) => Math.abs(point.value)));

  return (
    <div className="news-widget__tone-chart" aria-label="GDELT tone timeline">
      {points.map((point, index) => {
        const height = Math.max(8, (Math.abs(point.value) / maxAbs) * 100);
        const style = { "--tone-height": `${height}%` } as CSSProperties;
        return (
          <span
            className="news-widget__tone-bar"
            data-tone={toneBucket(point.value)}
            key={`${point.date}-${index}`}
            style={style}
            title={`${formatTime(point.date)} ${formatTone(point.value)}`}
          />
        );
      })}
    </div>
  );
}

function SentimentSummary({ sentiment }: { sentiment: NewsSentiment }) {
  const total =
    sentiment.positive + sentiment.neutral + sentiment.negative || 1;

  return (
    <section className="news-widget__sentiment" aria-label="GDELT sentiment">
      <div className="news-widget__tone-summary">
        <div className="news-widget__tone-card">
          <span>Avg tone</span>
          <strong data-tone={toneBucket(sentiment.averageTone)}>
            {formatTone(sentiment.averageTone)}
          </strong>
        </div>
        <div className="news-widget__tone-card">
          <span>Latest</span>
          <strong data-tone={toneBucket(sentiment.latestTone)}>
            {formatTone(sentiment.latestTone)}
          </strong>
        </div>
        <div className="news-widget__tone-card">
          <span>Trend</span>
          <strong data-tone={sentiment.trend}>
            {trendLabel(sentiment.trend)}
          </strong>
        </div>
      </div>
      <ToneChart timeline={sentiment.timeline} />
      <div className="news-widget__sentiment-split">
        <span>
          <b>{Math.round((sentiment.positive / total) * 100)}%</b> positive
        </span>
        <span>
          <b>{Math.round((sentiment.neutral / total) * 100)}%</b> neutral
        </span>
        <span>
          <b>{Math.round((sentiment.negative / total) * 100)}%</b> negative
        </span>
      </div>
    </section>
  );
}

export function NewsWidget({ moniker = "news/gdelt" }: { moniker?: string }) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [provider, setProvider] = useState<string | null>(null);
  const [sentiment, setSentiment] = useState<NewsSentiment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadNews() {
      setIsLoading(true);
      setError(null);
      try {
        const body = await queryData<NewsResponse>({
          moniker,
          shape: "news",
          params: { limit: 8 },
        });
        if (!cancelled) {
          setItems(body.results ?? []);
          setProvider(body.provider ?? null);
          setSentiment(body.consensus ?? body.sentiment ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setSentiment(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadNews();
    return () => {
      cancelled = true;
    };
  }, [moniker]);

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
      {sentiment ? <SentimentSummary sentiment={sentiment} /> : null}
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
