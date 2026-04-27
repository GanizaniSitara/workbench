import { Router } from "express";

interface GdeltArticle {
  title?: string;
  url?: string;
  sourceCountry?: string;
  domain?: string;
  seendate?: string;
  socialimage?: string;
}

interface GdeltResponse {
  articles?: GdeltArticle[];
}

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

const DEFAULT_QUERY =
  '("financial markets" OR "central bank" OR "bond yields" OR "stock market" OR earnings) sourcelang:English';
const DEFAULT_SYMBOLS = "SPY,QQQ,AAPL,MSFT,NVDA";

function normalizeDate(value: string | undefined): string | null {
  if (!value) return null;
  const compact = value.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?/);
  if (!compact) return value;
  const [, year, month, day, hour = "00", minute = "00"] = compact;
  return `${year}-${month}-${day}T${hour}:${minute}:00Z`;
}

export const newsRouter = Router();

newsRouter.get("/", async (req, res) => {
  const parsedLimit = Number.parseInt(String(req.query.limit ?? "20"), 10);
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;
  const symbols =
    typeof req.query.symbols === "string" ? req.query.symbols : DEFAULT_SYMBOLS;
  const openbbUrl = process.env.OPENBB_BASE_URL;

  if (openbbUrl) {
    const url = new URL(`${openbbUrl}/api/v1/news/company`);
    url.searchParams.set("provider", "yfinance");
    url.searchParams.set("symbol", symbols);
    url.searchParams.set("limit", String(Math.min(limit, 10)));

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        const body = (await response.json()) as OpenBbNewsResponse;
        const seen = new Set<string>();
        const results = (body.results ?? [])
          .filter((article) => {
            const key = article.url ?? article.title ?? article.id;
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .sort((a, b) =>
            String(b.date ?? "").localeCompare(String(a.date ?? "")),
          )
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

        return res.json({
          provider: body.provider ?? "openbb-yfinance",
          results,
        });
      }
    } catch {
      // Fall through to GDELT below.
    }
  }

  const query = typeof req.query.q === "string" ? req.query.q : DEFAULT_QUERY;
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("format", "json");
  url.searchParams.set("sort", "datedesc");
  url.searchParams.set("timespan", "24h");
  url.searchParams.set("maxrecords", String(limit));

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      return res
        .status(502)
        .json({ error: `GDELT returned HTTP ${response.status}` });
    }

    const body = (await response.json()) as GdeltResponse;
    const results = (body.articles ?? []).map((article) => ({
      title: article.title ?? "Untitled",
      url: article.url ?? "",
      domain: article.domain ?? null,
      country: article.sourceCountry ?? null,
      publishedAt: normalizeDate(article.seendate),
      imageUrl: article.socialimage ?? null,
    }));

    return res.json({
      provider: "gdelt",
      results,
    });
  } catch (err) {
    return res.status(502).json({
      error:
        err instanceof Error ? err.message : "Unable to reach news provider",
    });
  }
});
