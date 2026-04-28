import type { RouteStep } from "../route-plan";
import type { SeriesPoint, YieldPoint } from "./questdb";

export interface OpenBbLatestSeries {
  value: number | null;
  date: string | null;
  error?: string;
}

const MATURITY_KEYS = [
  "month1",
  "month3",
  "month6",
  "year1",
  "year2",
  "year5",
  "year10",
  "year20",
  "year30",
] as const;

function routeUrl(baseUrl: string, route: RouteStep, params = ""): string {
  const endpoint = String(route.ref.endpoint);
  const provider = String(route.ref.provider);
  const separator = params ? "&" : "";
  return `${baseUrl}${endpoint}?${params}${separator}provider=${provider}`;
}

function normalizeSeriesResults(
  rows: Array<{ date?: string; value?: number }>,
): SeriesPoint[] {
  return rows
    .map((row) => ({
      date: String(row.date ?? "").split("T")[0],
      value: Number(row.value),
    }))
    .filter((point) => point.date && Number.isFinite(point.value))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeYieldCurveResponse(body: unknown): {
  results: YieldPoint[];
  source: "openbb";
} | null {
  if (!body || typeof body !== "object") return null;

  const payload = body as {
    results?: Array<Record<string, unknown>>;
    data?: Array<Record<string, unknown>>;
  };
  const rows = payload.results ?? payload.data ?? [];
  const latest = rows[0];
  if (!latest) return null;

  const results = MATURITY_KEYS.map((maturity) => ({
    maturity,
    rate: Number(latest[maturity]),
  })).filter((point) => Number.isFinite(point.rate));

  return results.length ? { results, source: "openbb" } : null;
}

export async function fetchLatestSeriesFromOpenBb(
  baseUrl: string,
  route: RouteStep,
): Promise<OpenBbLatestSeries> {
  try {
    const symbol = String(route.ref.symbol);
    const response = await fetch(
      routeUrl(baseUrl, route, `symbol=${symbol}&limit=1`),
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) {
      return {
        value: null,
        date: null,
        error: `HTTP ${response.status}`,
      };
    }

    const body = await response.json();
    const latest = body?.results?.[0] ?? null;
    return {
      value: latest?.value ?? null,
      date: latest?.date ?? null,
    };
  } catch (err) {
    return { value: null, date: null, error: String(err) };
  }
}

export async function fetchSeriesFromOpenBb(
  baseUrl: string,
  route: RouteStep,
  limit: number,
): Promise<SeriesPoint[] | null> {
  try {
    const symbol = String(route.ref.symbol);
    const response = await fetch(
      routeUrl(baseUrl, route, `symbol=${symbol}&limit=${limit}`),
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) return null;

    const body = await response.json();
    const rows: Array<{ date?: string; value?: number }> = body?.results ?? [];
    if (!rows.length) return null;

    const results = normalizeSeriesResults(rows);
    return results.length ? results : null;
  } catch {
    return null;
  }
}

export async function fetchYieldCurveFromOpenBb(
  baseUrl: string,
  route: RouteStep,
): Promise<{ results: YieldPoint[]; source: "openbb" } | null> {
  try {
    const response = await fetch(routeUrl(baseUrl, route), {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;

    return normalizeYieldCurveResponse(await response.json());
  } catch {
    return null;
  }
}

// Reference rates: SONIA, SOFR, ESTR, EFFR
// These endpoints return values in decimal form (0.044 = 4.4%) and sort ascending,
// so we use a rolling 30-day start_date window and take the last (most recent) record.
export async function fetchLatestReferenceRateFromOpenBb(
  baseUrl: string,
  route: RouteStep,
): Promise<OpenBbLatestSeries> {
  try {
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const url = routeUrl(baseUrl, route, `start_date=${startDate}`);
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      return { value: null, date: null, error: `HTTP ${response.status}` };
    }
    const body = await response.json();
    const results: Array<Record<string, unknown>> = body?.results ?? [];
    const latest = results[results.length - 1] ?? null;
    const raw = latest?.rate ?? latest?.value ?? null;
    return {
      value: raw !== null ? Number(raw) * 100 : null,
      date: typeof latest?.date === "string" ? latest.date.split("T")[0] : null,
    };
  } catch (err) {
    return { value: null, date: null, error: String(err) };
  }
}

// Latest equity close via yfinance — used for snapshot queries (e.g. VIX card)
export async function fetchLatestEquityFromOpenBb(
  baseUrl: string,
  route: RouteStep,
): Promise<OpenBbLatestSeries> {
  try {
    const symbol = String(route.ref.symbol);
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const url = routeUrl(
      baseUrl,
      route,
      `symbol=${encodeURIComponent(symbol)}&start_date=${startDate}`,
    );
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      return { value: null, date: null, error: `HTTP ${response.status}` };
    }
    const body = await response.json();
    const results: Array<Record<string, unknown>> = body?.results ?? [];
    const latest = results[results.length - 1] ?? null;
    const close = latest?.close ?? null;
    return {
      value: close !== null ? Number(close) : null,
      date: typeof latest?.date === "string" ? latest.date.split("T")[0] : null,
    };
  } catch (err) {
    return { value: null, date: null, error: String(err) };
  }
}

// Equity price history via yfinance — maps `close` to `value`
export async function fetchEquityHistoryFromOpenBb(
  baseUrl: string,
  route: RouteStep,
): Promise<SeriesPoint[] | null> {
  try {
    const symbol = String(route.ref.symbol);
    const limit = Number(route.ref.limit ?? 252);
    const url = routeUrl(
      baseUrl,
      route,
      `symbol=${encodeURIComponent(symbol)}&limit=${limit}`,
    );
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return null;
    const body = await response.json();
    const rows: Array<{ date?: string; close?: number }> = body?.results ?? [];
    if (!rows.length) return null;
    return rows
      .map((row) => ({
        date: String(row.date ?? "").split("T")[0],
        value: Number(row.close),
      }))
      .filter((point) => point.date && Number.isFinite(point.value))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return null;
  }
}
