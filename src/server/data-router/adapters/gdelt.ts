import https from "node:https";
import { setTimeout as delay } from "node:timers/promises";
import type { RouteStep } from "../route-plan";

interface GdeltArticle {
  title?: string;
  url?: string;
  sourceCountry?: string;
  sourcecountry?: string;
  domain?: string;
  seendate?: string;
  socialimage?: string;
}

interface GdeltArticleResponse {
  articles?: GdeltArticle[];
}

interface GdeltTimelinePoint {
  date?: string;
  value?: number;
}

interface GdeltTimelineResponse {
  timeline?: Array<{
    series?: string;
    data?: GdeltTimelinePoint[];
  }>;
}

export interface NewsItem {
  title: string;
  url: string;
  domain: string | null;
  country: string | null;
  publishedAt: string | null;
  summary?: string | null;
  imageUrl: string | null;
}

export interface NewsConsensus {
  averageTone: number | null;
  latestTone: number | null;
  positive: number;
  neutral: number;
  negative: number;
  trend: "improving" | "deteriorating" | "flat";
  timeline: Array<{ date: string; value: number }>;
}

export interface GdeltNewsResult {
  provider: "gdelt";
  topic: string;
  results: NewsItem[];
  consensus: NewsConsensus;
  sentiment: NewsConsensus;
}

const DEFAULT_QUERY =
  '("financial markets" OR "central bank" OR "bond yields" OR "stock market" OR earnings) sourcelang:English';
const DEFAULT_TIMESPAN = "24h";
const CACHE_TTL_MS = 5 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 5_500;
const REQUEST_TIMEOUT_MS = 45_000;

const QUERY_PRESETS: Record<string, string> = {
  markets: DEFAULT_QUERY,
  macro:
    '("inflation" OR "jobs report" OR "unemployment" OR "GDP" OR "central bank" OR "monetary policy") sourcelang:English',
  credit:
    '("credit spreads" OR "corporate bonds" OR "default risk" OR "high yield" OR "investment grade") sourcelang:English',
};

const cache = new Map<
  string,
  {
    expiresAt: number;
    pending?: Promise<GdeltNewsResult>;
    payload?: GdeltNewsResult;
  }
>();
let lastRequestAt = 0;

function routeString(route: RouteStep, key: string, fallback: string): string {
  const value = route.ref[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function routeNumber(route: RouteStep, key: string, fallback: number): number {
  const value = route.ref[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(250, Math.floor(value)));
}

function normalizeDate(value: string | undefined): string | null {
  if (!value) return null;
  const compact = value.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?/);
  if (!compact) return value;
  const [, year, month, day, hour = "00", minute = "00"] = compact;
  return `${year}-${month}-${day}T${hour}:${minute}:00Z`;
}

function buildGdeltUrl(
  route: RouteStep,
  mode: "artlist" | "timelinetone",
): URL {
  const topic = routeString(route, "topic", "markets").toLowerCase();
  const customQuery = routeString(route, "query", "");
  const limit = routeNumber(route, "limit", 8);
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");

  url.searchParams.set(
    "query",
    customQuery || QUERY_PRESETS[topic] || DEFAULT_QUERY,
  );
  url.searchParams.set("mode", mode);
  url.searchParams.set("format", "json");
  url.searchParams.set(
    "timespan",
    routeString(route, "timespan", DEFAULT_TIMESPAN),
  );

  if (mode === "artlist") {
    url.searchParams.set("sort", routeString(route, "sort", "hybridrel"));
    url.searchParams.set("maxrecords", String(limit));
  }

  return url;
}

async function waitForRequestSlot(): Promise<void> {
  const elapsed = Date.now() - lastRequestAt;
  const waitMs = Math.max(0, MIN_REQUEST_INTERVAL_MS - elapsed);
  if (waitMs > 0) await delay(waitMs);
  lastRequestAt = Date.now();
}

function httpsJson<T>(url: URL): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "Workbench-GDELT-Proxy/0.1",
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const statusCode = response.statusCode ?? 0;
          const body = Buffer.concat(chunks).toString("utf8");
          if (statusCode < 200 || statusCode >= 300) {
            reject(new Error(`GDELT returned HTTP ${statusCode}`));
            return;
          }

          try {
            resolve(JSON.parse(body) as T);
          } catch {
            reject(new Error("GDELT returned invalid JSON"));
          }
        });
      },
    );

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error("GDELT request timed out"));
    });
    request.on("error", reject);
  });
}

async function fetchGdeltJson<T>(url: URL): Promise<T> {
  await waitForRequestSlot();

  try {
    return await httpsJson<T>(url);
  } catch (error) {
    if (error instanceof Error && error.message.includes("HTTP 429")) {
      await delay(MIN_REQUEST_INTERVAL_MS);
      lastRequestAt = Date.now();
      return httpsJson<T>(url);
    }
    throw error;
  }
}

function buildConsensus(body: GdeltTimelineResponse): NewsConsensus {
  const timeline = (body.timeline?.[0]?.data ?? [])
    .map((point) => ({
      date: normalizeDate(point.date) ?? "",
      value: Number(point.value),
    }))
    .filter((point) => point.date && Number.isFinite(point.value));

  if (!timeline.length) {
    return {
      averageTone: null,
      latestTone: null,
      positive: 0,
      neutral: 0,
      negative: 0,
      trend: "flat",
      timeline: [],
    };
  }

  const averageTone =
    timeline.reduce((sum, point) => sum + point.value, 0) / timeline.length;
  const latestTone = timeline[timeline.length - 1].value;
  const positive = timeline.filter((point) => point.value > 1).length;
  const negative = timeline.filter((point) => point.value < -1).length;
  const neutral = timeline.length - positive - negative;
  const firstHalf = timeline.slice(
    0,
    Math.max(1, Math.floor(timeline.length / 2)),
  );
  const secondHalf = timeline.slice(firstHalf.length);
  const avg = (points: typeof timeline) =>
    points.reduce((sum, point) => sum + point.value, 0) /
    Math.max(1, points.length);
  const delta = avg(secondHalf.length ? secondHalf : timeline) - avg(firstHalf);

  return {
    averageTone,
    latestTone,
    positive,
    neutral,
    negative,
    trend:
      delta > 0.35 ? "improving" : delta < -0.35 ? "deteriorating" : "flat",
    timeline,
  };
}

function normalizeArticles(
  body: GdeltArticleResponse,
  limit: number,
): NewsItem[] {
  const seen = new Set<string>();
  return (body.articles ?? [])
    .filter((article) => {
      const key = article.url ?? article.title;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map((article) => ({
      title: article.title ?? "Untitled",
      url: article.url ?? "",
      domain: article.domain ?? null,
      country: article.sourceCountry ?? article.sourcecountry ?? null,
      publishedAt: normalizeDate(article.seendate),
      imageUrl: article.socialimage ?? null,
    }));
}

export async function fetchNewsFromGdelt(
  route: RouteStep,
): Promise<GdeltNewsResult> {
  const topic = routeString(route, "topic", "markets").toLowerCase();
  const limit = routeNumber(route, "limit", 8);
  const toneUrl = buildGdeltUrl(route, "timelinetone");
  const articleUrl = buildGdeltUrl(route, "artlist");
  const cacheKey = `${toneUrl.toString()}|${articleUrl.toString()}`;
  const cached = cache.get(cacheKey);

  if (cached?.payload && cached.expiresAt > Date.now()) {
    return cached.payload;
  }
  if (cached?.pending) return cached.pending;

  const pending = (async () => {
    const tone = await fetchGdeltJson<GdeltTimelineResponse>(toneUrl);
    let articles: GdeltArticleResponse = { articles: [] };
    try {
      articles = await fetchGdeltJson<GdeltArticleResponse>(articleUrl);
    } catch {
      articles = { articles: [] };
    }

    const consensus = buildConsensus(tone);
    return {
      provider: "gdelt" as const,
      topic,
      results: normalizeArticles(articles, limit),
      consensus,
      sentiment: consensus,
    };
  })();

  cache.set(cacheKey, { expiresAt: 0, pending });

  try {
    const payload = await pending;
    cache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      payload,
    });
    return payload;
  } catch (error) {
    cache.delete(cacheKey);
    if (cached?.payload) return cached.payload;
    throw error;
  }
}
