import { Router } from "express";
import { DataQueryError, queryData } from "../data-router/query-service";
import type { DatasetRequest } from "../data-router/route-plan";

interface OpenBbNewsItem {
  date?: string;
  title?: string;
  url?: string;
  source?: string;
  symbol?: string;
  summary?: string;
  id?: string;
}

interface OpenBbNewsResponse {
  results?: OpenBbNewsItem[];
  provider?: string;
}

interface NormalizedNewsItem {
  title: string;
  url: string;
  domain: string | null;
  country: string | null;
  publishedAt: string | null;
  summary?: string | null;
  imageUrl: string | null;
}

interface NewsProviderResponse {
  provider: string;
  results: NormalizedNewsItem[];
}

const DEFAULT_SYMBOLS = "SPY,QQQ,AAPL,MSFT,NVDA";

export const newsRouter = Router();

function parseLimit(value: unknown): number {
  const parsedLimit = Number.parseInt(String(value ?? "20"), 10);
  return Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, 250)
    : 20;
}

function requestedProvider(value: unknown): "auto" | "openbb" | "gdelt" {
  const provider = typeof value === "string" ? value.toLowerCase() : "auto";
  if (provider === "gdelt") return "gdelt";
  if (provider === "openbb" || provider === "openbb-yfinance") return "openbb";
  return "auto";
}

function readQueryString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function fetchOpenBbNews(
  openbbUrl: string,
  symbols: string,
  limit: number,
): Promise<NewsProviderResponse> {
  const url = new URL(`${openbbUrl}/api/v1/news/company`);
  url.searchParams.set("provider", "yfinance");
  url.searchParams.set("symbol", symbols);
  url.searchParams.set("limit", String(Math.min(limit, 10)));

  const response = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`OpenBB returned HTTP ${response.status}`);
  }

  const body = (await response.json()) as OpenBbNewsResponse;
  const seen = new Set<string>();
  const results = (body.results ?? [])
    .filter((article) => {
      const key = article.url ?? article.title ?? article.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")))
    .slice(0, limit)
    .map((article) => ({
      title: article.title ?? "Untitled",
      url: article.url ?? "",
      domain: article.source ?? null,
      country: article.symbol ?? null,
      publishedAt: article.date ?? null,
      summary: article.summary ?? null,
      imageUrl: null,
    }));

  return {
    provider: body.provider ?? "openbb-yfinance",
    results,
  };
}

function gdeltRequestFromQuery(query: Record<string, unknown>, limit: number) {
  const params: DatasetRequest["params"] = { limit };
  const passthrough = ["topic", "timespan", "sort"] as const;

  for (const key of passthrough) {
    const value = readQueryString(query[key]);
    if (value) params[key] = value;
  }

  const customQuery = readQueryString(query.q);
  if (customQuery) params.query = customQuery;

  return {
    moniker: "news/gdelt",
    shape: "news" as const,
    params,
  };
}

newsRouter.get("/", async (req, res) => {
  const limit = parseLimit(req.query.limit);
  const symbols =
    typeof req.query.symbols === "string" ? req.query.symbols : DEFAULT_SYMBOLS;
  const openbbUrl = process.env.OPENBB_BASE_URL;
  const provider = requestedProvider(req.query.provider);

  if (provider !== "gdelt" && openbbUrl) {
    try {
      return res.json(await fetchOpenBbNews(openbbUrl, symbols, limit));
    } catch (err) {
      if (provider === "openbb") {
        return res.status(502).json({
          error: err instanceof Error ? err.message : "OpenBB news unavailable",
        });
      }
      // Auto provider falls through to GDELT through the generic router.
    }
  } else if (provider === "openbb") {
    return res.status(503).json({ error: "OPENBB_BASE_URL is not configured" });
  }

  try {
    return res.json(await queryData(gdeltRequestFromQuery(req.query, limit)));
  } catch (err) {
    if (err instanceof DataQueryError) {
      return res.status(err.status).json({ error: err.message });
    }
    return res.status(502).json({ error: "Unable to reach news provider" });
  }
});
