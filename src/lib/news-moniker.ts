export type NewsProvider = "openbb" | "gdelt";

const NEWS_MONIKER_RE = /^news\.([^/]+)(?:\/(.+))?$/;
const NEWS_SLASH_MONIKER_RE = /^news\/([^/]+)(?:\/(.+))?$/;
const NEWS_COMPANY_SYMBOLS_RE = /^news\.company(?:\/(.*))?$/;
const EQUITY_SYMBOL_RE = /^equity\.prices\/([^/]+)/;

export function symbolsFromNewsMoniker(
  moniker: string | undefined,
  fallback: string[],
): string[] {
  const equitySymbol = moniker?.match(EQUITY_SYMBOL_RE)?.[1];
  if (equitySymbol) return [equitySymbol.toUpperCase()];

  const companyMatch = moniker?.match(NEWS_COMPANY_SYMBOLS_RE);
  if (!companyMatch) return fallback;

  return (companyMatch[1] ?? "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
}

export function newsMonikerFromSymbols(symbols: string[]): string {
  if (symbols.length === 0) return "news.company";
  return `news.company/${symbols.join(",")}`;
}

export function newsProviderFromMoniker(
  moniker: string | undefined,
): NewsProvider | undefined {
  const namespace = (
    moniker?.match(NEWS_SLASH_MONIKER_RE)?.[1] ??
    moniker?.match(NEWS_MONIKER_RE)?.[1]
  )?.toLowerCase();
  if (namespace === "gdelt") return "gdelt";
  if (namespace === "company") return "openbb";
  return undefined;
}

export function newsTopicFromMoniker(
  moniker: string | undefined,
): string | undefined {
  const match =
    moniker?.match(NEWS_SLASH_MONIKER_RE) ?? moniker?.match(NEWS_MONIKER_RE);
  if (match?.[1]?.toLowerCase() !== "gdelt") return undefined;
  return match[2]?.trim().toLowerCase();
}

export function newsApiPath(
  moniker: string | undefined,
  symbols: string[],
  limit?: number,
): string {
  const params = new URLSearchParams();
  if (symbols.length) params.set("symbols", symbols.join(","));
  if (limit !== undefined) params.set("limit", String(limit));

  const provider = newsProviderFromMoniker(moniker);
  if (provider) params.set("provider", provider);

  const topic = newsTopicFromMoniker(moniker);
  if (topic) params.set("topic", topic);

  const query = params.toString();
  return query ? `/api/news?${query}` : "/api/news";
}
