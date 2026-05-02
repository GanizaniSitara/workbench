import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import https from "node:https";
import { dirname, resolve } from "node:path";
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
const CACHE_TTL_MS = 15 * 60 * 1000;
const STALE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 5_500;
const REQUEST_TIMEOUT_MS = 45_000;
const DISK_CACHE_PATH = resolve(
  process.cwd(),
  process.env.GDELT_CACHE_PATH ?? ".cache/gdelt-news-cache.json",
);

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
    staleUntil: number;
    pending?: Promise<GdeltNewsResult>;
    payload?: GdeltNewsResult;
  }
>();
let lastRequestAt = 0;
let diskCacheLoaded = false;

function loadDiskCache(): void {
  if (diskCacheLoaded) return;
  diskCacheLoaded = true;
  if (!existsSync(DISK_CACHE_PATH)) return;

  try {
    const raw = JSON.parse(readFileSync(DISK_CACHE_PATH, "utf8")) as Record<
      string,
      {
        expiresAt?: unknown;
        staleUntil?: unknown;
        payload?: unknown;
      }
    >;
    const now = Date.now();
    for (const [key, entry] of Object.entries(raw)) {
      if (
        typeof entry.expiresAt !== "number" ||
        typeof entry.staleUntil !== "number" ||
        entry.staleUntil <= now ||
        !entry.payload
      ) {
        continue;
      }
      const payload = entry.payload as Partial<GdeltNewsResult>;
      if (!Array.isArray(payload.results) || payload.results.length === 0) {
        continue;
      }
      cache.set(key, {
        expiresAt: entry.expiresAt,
        staleUntil: entry.staleUntil,
        payload: payload as GdeltNewsResult,
      });
    }
  } catch {
    // Cache is best-effort; corrupt files should not block the data router.
  }
}

function persistDiskCache(): void {
  try {
    const now = Date.now();
    const payload = Object.fromEntries(
      Array.from(cache.entries())
        .filter(
          ([, entry]) =>
            entry.payload &&
            entry.payload.results.length > 0 &&
            entry.staleUntil > now,
        )
        .map(([key, entry]) => [
          key,
          {
            expiresAt: entry.expiresAt,
            staleUntil: entry.staleUntil,
            payload: entry.payload,
          },
        ]),
    );
    mkdirSync(dirname(DISK_CACHE_PATH), { recursive: true });
    writeFileSync(DISK_CACHE_PATH, JSON.stringify(payload), "utf8");
  } catch {
    // The in-memory cache remains usable if the disk cache cannot be written.
  }
}

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
  } catch {
    await delay(MIN_REQUEST_INTERVAL_MS);
    lastRequestAt = Date.now();
    return httpsJson<T>(url);
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

async function fetchFreshNewsFromGdelt(
  route: RouteStep,
  topic: string,
  limit: number,
): Promise<GdeltNewsResult> {
  const toneUrl = buildGdeltUrl(route, "timelinetone");
  const articleUrl = buildGdeltUrl(route, "artlist");
  const articles = await fetchGdeltJson<GdeltArticleResponse>(articleUrl);
  let consensus: NewsConsensus;
  try {
    consensus = buildConsensus(
      await fetchGdeltJson<GdeltTimelineResponse>(toneUrl),
    );
  } catch {
    consensus = buildConsensus({});
  }

  return {
    provider: "gdelt" as const,
    topic,
    results: normalizeArticles(articles, limit),
    consensus,
    sentiment: consensus,
  };
}

function startRefresh(
  cacheKey: string,
  route: RouteStep,
  topic: string,
  limit: number,
): Promise<GdeltNewsResult> {
  const previous = cache.get(cacheKey);
  const pending = fetchFreshNewsFromGdelt(route, topic, limit);

  cache.set(cacheKey, {
    expiresAt: previous?.expiresAt ?? 0,
    staleUntil: previous?.staleUntil ?? 0,
    payload: previous?.payload,
    pending,
  });

  void pending
    .then((payload) => {
      if (payload.results.length === 0 && previous?.payload?.results.length) {
        cache.set(cacheKey, {
          ...previous,
          expiresAt: Date.now() + CACHE_TTL_MS,
          staleUntil: Date.now() + STALE_CACHE_TTL_MS,
        });
        persistDiskCache();
        return;
      }

      cache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        staleUntil: Date.now() + STALE_CACHE_TTL_MS,
        payload,
      });
      persistDiskCache();
    })
    .catch(() => {
      if (previous?.payload) {
        cache.set(cacheKey, previous);
      } else {
        cache.delete(cacheKey);
      }
    });

  return pending;
}

function needsConsensusRefresh(payload: GdeltNewsResult): boolean {
  return (
    payload.consensus.averageTone === null ||
    payload.consensus.timeline.length === 0
  );
}

export async function fetchNewsFromGdelt(
  route: RouteStep,
): Promise<GdeltNewsResult> {
  const topic = routeString(route, "topic", "markets").toLowerCase();
  const limit = routeNumber(route, "limit", 8);
  const toneUrl = buildGdeltUrl(route, "timelinetone");
  const articleUrl = buildGdeltUrl(route, "artlist");
  const cacheKey = `${toneUrl.toString()}|${articleUrl.toString()}`;
  loadDiskCache();
  const cached = cache.get(cacheKey);
  const now = Date.now();

  if (cached?.payload && cached.expiresAt > now) {
    if (needsConsensusRefresh(cached.payload) && !cached.pending) {
      void startRefresh(cacheKey, route, topic, limit);
    }
    return cached.payload;
  }

  if (cached?.payload && cached.staleUntil > now) {
    if (!cached.pending) {
      void startRefresh(cacheKey, route, topic, limit);
    }
    return cached.payload;
  }

  if (cached?.pending) return cached.pending;

  return startRefresh(cacheKey, route, topic, limit);
}
