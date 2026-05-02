import {
  fetchEquityHistoryFromOpenBb,
  fetchLatestEquityFromOpenBb,
  fetchLatestReferenceRateFromOpenBb,
  fetchLatestSeriesFromOpenBb,
  fetchSeriesFromOpenBb,
  fetchYieldCurveFromOpenBb,
} from "./adapters/openbb";
import { fetchNewsFromGdelt, type GdeltNewsResult } from "./adapters/gdelt";
import {
  fetchPortfolioExposure,
  fetchPortfolioPositions,
  fetchPortfolioSummary,
  fetchPositionPnlHistory,
  fetchPositionSnapshot,
} from "./adapters/portfolio";
import {
  fetchLatestSeriesFromQuestDb,
  fetchSeriesFromQuestDb,
  fetchYieldCurveFromQuestDb,
  type SeriesPoint,
  type YieldPoint,
} from "./adapters/questdb";
import { executeRoutePlan } from "./data-router";
import type { DatasetRequest, RoutePlan } from "./route-plan";
import { resolveRoutePlan } from "./route-plan-resolver";

const MACRO_SERIES = [
  { id: "FEDFUNDS", label: "Fed Funds Rate" },
  { id: "DGS2", label: "2Y Treasury" },
  { id: "DGS10", label: "10Y Treasury" },
  { id: "DGS30", label: "30Y Treasury" },
  { id: "T10Y2Y", label: "10Y-2Y Spread" },
  { id: "CPIAUCSL", label: "CPI (YoY)" },
  { id: "UNRATE", label: "Unemployment Rate" },
  { id: "VIXCLS", label: "VIX" },
] as const;

const MACRO_SYMBOLS: Set<string> = new Set(
  MACRO_SERIES.map((series) => series.id),
);

const CORPORATE_BOND_SYMBOLS = new Set([
  "BAMLC0A0CM",
  "BAMLH0A0HYM2",
  "BAMLC0A0CMEY",
  "BAMLH0A0HYM2EY",
  "BAMLCC0A0CMTRIV",
  "BAMLHYH0A0HYM2TRIV",
  "BAMLHE00EHYIOAS",
]);

const SERIES_INFO: Record<
  string,
  { label: string; format: "percent" | "level" }
> = {
  FEDFUNDS: { label: "Fed Funds Rate", format: "percent" },
  DGS2: { label: "2Y Treasury", format: "percent" },
  DGS10: { label: "10Y Treasury", format: "percent" },
  DGS30: { label: "30Y Treasury", format: "percent" },
  T10Y2Y: { label: "10Y-2Y Spread", format: "percent" },
  CPIAUCSL: { label: "CPI", format: "level" },
  UNRATE: { label: "Unemployment Rate", format: "percent" },
  VIXCLS: { label: "VIX", format: "level" },
  BAMLC0A0CM: { label: "US IG Corporate OAS", format: "percent" },
  BAMLH0A0HYM2: { label: "US High Yield OAS", format: "percent" },
  BAMLC0A0CMEY: { label: "US IG Corporate Yield", format: "percent" },
  BAMLH0A0HYM2EY: { label: "US High Yield Yield", format: "percent" },
  BAMLCC0A0CMTRIV: { label: "US IG Corporate TR", format: "level" },
  BAMLHYH0A0HYM2TRIV: { label: "US High Yield TR", format: "level" },
  BAMLHE00EHYIOAS: { label: "Euro High Yield OAS", format: "percent" },
};

const REFERENCE_RATE_SERIES = [
  { id: "SONIA", label: "SONIA", moniker: "reference.rates/SONIA" },
  { id: "SOFR", label: "SOFR", moniker: "reference.rates/SOFR" },
  { id: "ESTR", label: "ESTR", moniker: "reference.rates/ESTR" },
  { id: "EFFR", label: "EFFR", moniker: "reference.rates/EFFR" },
] as const;

const RANGE_LIMITS: Record<string, number> = {
  "1m": 31,
  "3m": 93,
  "6m": 186,
  "1y": 366,
  "5y": 1830,
  max: 5000,
};

interface SeriesResult {
  id: string;
  label: string;
  value: number | null;
  date: string | null;
  source?: "cache" | "openbb";
  error?: string;
}

interface SeriesRouteResult {
  results: SeriesPoint[];
  source: "cache" | "openbb" | "portfolio-adapter";
}

interface DataQueryEnv {
  questdbUrl?: string;
  openbbUrl?: string;
}

export interface SnapshotQueryResult {
  shape: "snapshot";
  results: SeriesResult[];
}

export interface TimeseriesQueryResult {
  shape: "timeseries";
  symbol: string;
  label: string;
  format: "percent" | "level";
  range: string;
  source: "cache" | "openbb" | "portfolio-adapter";
  results: SeriesPoint[];
}

export interface CurveQueryResult {
  shape: "curve";
  source: "cache" | "openbb";
  results: YieldPoint[];
}

export interface TableQueryResult {
  shape: "table";
  results: Record<string, unknown>[];
}

export interface NewsQueryResult extends GdeltNewsResult {
  shape: "news";
  source: "gdelt";
}

export type DataQueryResult =
  | SnapshotQueryResult
  | TimeseriesQueryResult
  | CurveQueryResult
  | TableQueryResult
  | NewsQueryResult;

export class DataQueryError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function defaultEnv(): DataQueryEnv {
  return {
    questdbUrl: process.env.QUESTDB_URL,
    openbbUrl: process.env.OPENBB_BASE_URL,
  };
}

function canonicalMoniker(moniker: string): string {
  return moniker.replace(/\/date@[^/]*/g, "").replace(/\/filter@[^/]*/g, "");
}

function readStringParam(
  params: DatasetRequest["params"] | undefined,
  key: string,
): string | undefined {
  const value = params?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readNumberParam(
  params: DatasetRequest["params"] | undefined,
  key: string,
): number | undefined {
  const value = params?.[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function symbolFromMacroMoniker(moniker: string): string | null {
  const parts = canonicalMoniker(moniker).split("/");
  if (parts[0] !== "macro.indicators") return null;
  const symbol = parts[parts.length - 1]?.toUpperCase();
  return symbol && MACRO_SYMBOLS.has(symbol) ? symbol : null;
}

function symbolFromCorporateBondMoniker(moniker: string): string | null {
  const parts = canonicalMoniker(moniker).split("/");
  if (parts[0] !== "corporate.bonds") return null;
  const symbol = parts[parts.length - 1]?.toUpperCase();
  return symbol && CORPORATE_BOND_SYMBOLS.has(symbol) ? symbol : null;
}

function symbolFromSeriesMoniker(moniker: string): string | null {
  return (
    symbolFromMacroMoniker(moniker) ?? symbolFromCorporateBondMoniker(moniker)
  );
}

function referenceRateFromMoniker(
  moniker: string,
): (typeof REFERENCE_RATE_SERIES)[number] | null {
  const parts = canonicalMoniker(moniker).split("/");
  if (parts[0] !== "reference.rates" || parts.length !== 2) return null;

  const id = parts[1].toUpperCase();
  return REFERENCE_RATE_SERIES.find((series) => series.id === id) ?? null;
}

function withSymbolFromParams(request: DatasetRequest): DatasetRequest {
  const symbol = readStringParam(request.params, "symbol")?.toUpperCase();
  if (!symbol || canonicalMoniker(request.moniker) !== "macro.indicators") {
    return request;
  }

  return {
    ...request,
    moniker: `${request.moniker}/${symbol}/date@latest`,
  };
}

function fredSeriesRoutePlan(
  request: DatasetRequest,
  symbol: string,
  limit: number,
): RoutePlan {
  return {
    moniker: request.moniker,
    shape: "timeseries",
    routes: [
      {
        source: "questdb",
        ref: {
          table: "fred_series",
          symbol,
          limit,
        },
      },
      {
        source: "openbb",
        ref: {
          endpoint: "/api/v1/economy/fred_series",
          provider: "fred",
          symbol,
          limit,
        },
      },
    ],
    policy: { fallback: "ordered", ttlSeconds: 300 },
  };
}

async function querySeriesSnapshot(
  request: DatasetRequest,
  env: DataQueryEnv,
  id: string,
  label: string,
): Promise<SeriesResult> {
  const routePlan = await resolveRoutePlan({
    ...request,
    params: { limit: 1, ...request.params },
  });
  if (!routePlan) {
    return { id, label, value: null, date: null, error: "data unavailable" };
  }

  const routed = await executeRoutePlan<SeriesResult>(routePlan, {
    questdb: async (route) => {
      if (!env.questdbUrl) return null;
      const cached = await fetchLatestSeriesFromQuestDb(env.questdbUrl, route);
      return cached ? { id, label, ...cached, source: "cache" } : null;
    },
    openbb: async (route) => {
      if (!env.openbbUrl) return null;
      const isEquity = String(route.ref.endpoint).includes("/equity/");
      const live = isEquity
        ? await fetchLatestEquityFromOpenBb(env.openbbUrl, route)
        : await fetchLatestSeriesFromOpenBb(env.openbbUrl, route);
      return { id, label, ...live, source: "openbb" };
    },
  });

  if (routed) return routed.data;
  return { id, label, value: null, date: null, error: "data unavailable" };
}

async function querySnapshot(
  request: DatasetRequest,
  env: DataQueryEnv,
): Promise<SnapshotQueryResult> {
  const canonical = canonicalMoniker(request.moniker);

  if (canonical === "macro.indicators") {
    const results = await Promise.all(
      MACRO_SERIES.map(({ id, label }) =>
        querySeriesSnapshot(
          { ...request, moniker: `${request.moniker}/${id}/date@latest` },
          env,
          id,
          label,
        ),
      ),
    );

    return { shape: "snapshot" as const, results };
  }

  const symbol = symbolFromMacroMoniker(request.moniker);
  const series = symbol ? SERIES_INFO[symbol] : null;
  if (!symbol || !series) {
    throw new DataQueryError(400, `Unsupported snapshot: ${request.moniker}`);
  }

  const item = await querySeriesSnapshot(request, env, symbol, series.label);
  return { shape: "snapshot" as const, results: [item] };
}

async function queryTimeseries(
  request: DatasetRequest,
  env: DataQueryEnv,
): Promise<TimeseriesQueryResult> {
  const normalizedRequest = withSymbolFromParams(request);
  const requestedSymbol = symbolFromSeriesMoniker(normalizedRequest.moniker);
  const series = requestedSymbol ? SERIES_INFO[requestedSymbol] : null;

  if (!requestedSymbol || !series) {
    throw new DataQueryError(
      400,
      `Unsupported series: ${readStringParam(request.params, "symbol") ?? request.moniker}`,
    );
  }

  const requestedRange = readStringParam(normalizedRequest.params, "range");
  const resolvedRange =
    requestedRange && RANGE_LIMITS[requestedRange] ? requestedRange : "3m";
  const limit =
    readNumberParam(normalizedRequest.params, "limit") ??
    RANGE_LIMITS[resolvedRange];

  if (!env.questdbUrl && !env.openbbUrl) {
    throw new DataQueryError(
      503,
      "Neither QUESTDB_URL nor OPENBB_BASE_URL is configured",
    );
  }

  const routedRequest = {
    ...normalizedRequest,
    params: { ...normalizedRequest.params, limit, range: resolvedRange },
  };
  const routePlan =
    (await resolveRoutePlan(routedRequest)) ??
    fredSeriesRoutePlan(routedRequest, requestedSymbol, limit);

  const routed = await executeRoutePlan<SeriesRouteResult>(routePlan, {
    questdb: async (route) => {
      if (!env.questdbUrl) return null;
      const cached = await fetchSeriesFromQuestDb(env.questdbUrl, route, limit);
      return cached ? { results: cached, source: "cache" } : null;
    },
    openbb: async (route) => {
      if (!env.openbbUrl) return null;
      const live = await fetchSeriesFromOpenBb(env.openbbUrl, route, limit);
      return live ? { results: live, source: "openbb" } : null;
    },
  });

  if (routed) {
    return {
      shape: "timeseries" as const,
      symbol: requestedSymbol,
      label: series.label,
      format: series.format,
      range: resolvedRange,
      source: routed.data.source,
      results: routed.data.results,
    };
  }

  throw new DataQueryError(502, `No data returned for ${requestedSymbol}`);
}

interface CurveRouteResult {
  results: YieldPoint[];
  source: "cache" | "openbb";
}

async function queryCurve(
  request: DatasetRequest,
  env: DataQueryEnv,
): Promise<CurveQueryResult> {
  const routePlan = await resolveRoutePlan(request);
  if (!routePlan) {
    throw new DataQueryError(503, "data unavailable");
  }

  const routed = await executeRoutePlan<CurveRouteResult>(routePlan, {
    questdb: async (route) => {
      if (!env.questdbUrl) return null;
      const curve = await fetchYieldCurveFromQuestDb(env.questdbUrl, route);
      return curve ? { results: curve, source: "cache" } : null;
    },
    openbb: async (route) => {
      if (!env.openbbUrl) return null;
      return fetchYieldCurveFromOpenBb(env.openbbUrl, route);
    },
  });

  if (routed) {
    return {
      shape: "curve" as const,
      ...routed.data,
    };
  }

  throw new DataQueryError(503, "data unavailable");
}

async function queryReferenceRateSnapshot(
  request: DatasetRequest,
  env: DataQueryEnv,
  id: string,
  label: string,
  moniker: string,
): Promise<SeriesResult> {
  const routePlan = await resolveRoutePlan({
    ...request,
    moniker,
    shape: "snapshot",
    params: {},
  });
  if (!routePlan) {
    return { id, label, value: null, date: null, error: "data unavailable" };
  }

  const routed = await executeRoutePlan<SeriesResult>(routePlan, {
    openbb: async (route) => {
      if (!env.openbbUrl) return null;
      const live = await fetchLatestReferenceRateFromOpenBb(
        env.openbbUrl,
        route,
      );
      return { id, label, ...live, source: "openbb" as const };
    },
  });

  if (routed) return routed.data;
  return { id, label, value: null, date: null, error: "data unavailable" };
}

async function queryReferenceRatesSnapshot(
  request: DatasetRequest,
  env: DataQueryEnv,
): Promise<SnapshotQueryResult> {
  const results = await Promise.all(
    REFERENCE_RATE_SERIES.map(({ id, label, moniker }) =>
      queryReferenceRateSnapshot(request, env, id, label, moniker),
    ),
  );
  return { shape: "snapshot" as const, results };
}

async function queryEquityTimeseries(
  request: DatasetRequest,
  env: DataQueryEnv,
): Promise<TimeseriesQueryResult> {
  const parts = canonicalMoniker(request.moniker).split("/");
  const symbol = parts[1]?.toUpperCase();
  if (!symbol) {
    throw new DataQueryError(400, "equity.prices requires a symbol");
  }

  const requestedRange = readStringParam(request.params, "range");
  const resolvedRange =
    requestedRange && RANGE_LIMITS[requestedRange] ? requestedRange : "1y";
  const limit =
    readNumberParam(request.params, "limit") ?? RANGE_LIMITS[resolvedRange];

  if (!env.openbbUrl) {
    throw new DataQueryError(503, "OPENBB_BASE_URL is not configured");
  }

  const routePlan = await resolveRoutePlan({
    ...request,
    params: { ...request.params, limit, range: resolvedRange },
  });
  if (!routePlan) {
    throw new DataQueryError(503, "data unavailable");
  }

  const routed = await executeRoutePlan<SeriesRouteResult>(routePlan, {
    openbb: async (route) => {
      if (!env.openbbUrl) return null;
      const live = await fetchEquityHistoryFromOpenBb(env.openbbUrl, route);
      return live ? { results: live, source: "openbb" as const } : null;
    },
  });

  if (routed) {
    return {
      shape: "timeseries" as const,
      symbol,
      label: symbol,
      format: "level",
      range: resolvedRange,
      source: routed.data.source,
      results: routed.data.results,
    };
  }

  throw new DataQueryError(502, `No data returned for ${symbol}`);
}

async function queryNews(plan: RoutePlan): Promise<NewsQueryResult> {
  const routed = await executeRoutePlan<GdeltNewsResult>(plan, {
    gdelt: fetchNewsFromGdelt,
  });

  if (routed && routed.source === "gdelt") {
    return {
      shape: "news",
      source: routed.source,
      ...routed.data,
    };
  }

  throw new DataQueryError(503, `News unavailable: ${plan.moniker}`);
}

function isPortfolioPlan(plan: RoutePlan): boolean {
  return plan.routes.some((route) => route.source === "portfolio-adapter");
}

function portfolioPositionId(plan: RoutePlan): string {
  return String(plan.routes[0]?.ref.id ?? "");
}

async function queryPortfolioTable(plan: RoutePlan): Promise<TableQueryResult> {
  const routed = await executeRoutePlan<Record<string, unknown>[]>(plan, {
    "portfolio-adapter": async (route) => {
      if (route.ref.kind !== "positions") return null;
      const positions = await fetchPortfolioPositions();
      return positions.map((position) => ({ ...position }));
    },
  });

  if (routed) {
    return { shape: "table" as const, results: routed.data };
  }

  throw new DataQueryError(503, `Portfolio table unavailable: ${plan.moniker}`);
}

async function queryPortfolioSnapshot(
  plan: RoutePlan,
): Promise<SnapshotQueryResult> {
  const routed = await executeRoutePlan<unknown>(plan, {
    "portfolio-adapter": async (route) => {
      const kind = String(route.ref.kind);
      if (kind === "summary") {
        return fetchPortfolioSummary(await fetchPortfolioPositions());
      }
      if (kind === "exposure") {
        return fetchPortfolioExposure(await fetchPortfolioPositions());
      }
      if (kind === "position") {
        const position = await fetchPositionSnapshot(String(route.ref.id));
        if (!position) {
          throw new DataQueryError(404, "Position not found");
        }
        return position;
      }
      return null;
    },
  });

  if (routed) {
    return {
      shape: "snapshot" as const,
      results: routed.data as SeriesResult[],
    };
  }

  throw new DataQueryError(
    503,
    `Portfolio snapshot unavailable: ${plan.moniker}`,
  );
}

async function queryPortfolioTimeseries(
  plan: RoutePlan,
): Promise<TimeseriesQueryResult> {
  const id = portfolioPositionId(plan);
  const routed = await executeRoutePlan<SeriesRouteResult>(plan, {
    "portfolio-adapter": async (route) => {
      if (route.ref.kind !== "pnl-history") return null;
      const results = await fetchPositionPnlHistory(String(route.ref.id));
      if (!results) {
        throw new DataQueryError(404, "Position not found");
      }
      return { results, source: "portfolio-adapter" as const };
    },
  });

  if (routed) {
    return {
      shape: "timeseries" as const,
      symbol: id,
      label: "Position P&L",
      format: "level",
      range: "30d",
      source: routed.data.source,
      results: routed.data.results,
    };
  }

  throw new DataQueryError(
    503,
    `Portfolio timeseries unavailable: ${plan.moniker}`,
  );
}

export async function queryData(
  request: DatasetRequest,
  env: DataQueryEnv = defaultEnv(),
): Promise<DataQueryResult> {
  const canonical = canonicalMoniker(request.moniker);
  const referenceRate = referenceRateFromMoniker(request.moniker);

  if (request.shape === "snapshot" && canonical === "reference.rates") {
    return queryReferenceRatesSnapshot(request, env);
  }

  if (
    (!request.shape || request.shape === "snapshot") &&
    referenceRate !== null
  ) {
    const result = await queryReferenceRateSnapshot(
      request,
      env,
      referenceRate.id,
      referenceRate.label,
      referenceRate.moniker,
    );
    return { shape: "snapshot", results: [result] };
  }

  if (request.shape === "snapshot" && canonical === "macro.indicators") {
    return querySnapshot(request, env);
  }

  if (request.shape === "timeseries") {
    const normalizedRequest = withSymbolFromParams(request);
    const normalizedCanonical = canonicalMoniker(normalizedRequest.moniker);
    if (
      normalizedCanonical.startsWith("macro.indicators/") ||
      normalizedCanonical.startsWith("corporate.bonds/")
    ) {
      return queryTimeseries(normalizedRequest, env);
    }
  }

  const routePlan = await resolveRoutePlan(request);
  if (!routePlan) {
    throw new DataQueryError(503, "data unavailable");
  }

  const plannedRequest: DatasetRequest = {
    ...request,
    shape: routePlan.shape,
  };

  if (routePlan.shape === "news") {
    return queryNews(routePlan);
  }

  if (isPortfolioPlan(routePlan)) {
    if (routePlan.shape === "table") {
      return queryPortfolioTable(routePlan);
    }
    if (routePlan.shape === "snapshot") {
      return queryPortfolioSnapshot(routePlan);
    }
    if (routePlan.shape === "timeseries") {
      return queryPortfolioTimeseries(routePlan);
    }
  }

  if (routePlan.shape === "snapshot") {
    return querySnapshot(plannedRequest, env);
  }

  if (routePlan.shape === "timeseries") {
    if (canonical.startsWith("equity.prices/")) {
      return queryEquityTimeseries(plannedRequest, env);
    }
    return queryTimeseries(plannedRequest, env);
  }

  if (routePlan.shape === "curve") {
    return queryCurve(plannedRequest, env);
  }

  throw new DataQueryError(400, `Unsupported shape: ${routePlan.shape}`);
}
