import {
  fetchLatestSeriesFromOpenBb,
  fetchSeriesFromOpenBb,
  fetchYieldCurveFromOpenBb,
} from "./adapters/openbb";
import {
  fetchLatestSeriesFromQuestDb,
  fetchSeriesFromQuestDb,
  fetchYieldCurveFromQuestDb,
  type SeriesPoint,
  type YieldPoint,
} from "./adapters/questdb";
import { executeRoutePlan } from "./data-router";
import type { DatasetRequest, DatasetShape } from "./route-plan";
import { resolveRoutePlan } from "./route-plan-resolver";

const MACRO_SERIES = [
  { id: "FEDFUNDS", label: "Fed Funds Rate" },
  { id: "DGS2", label: "2Y Treasury" },
  { id: "DGS10", label: "10Y Treasury" },
  { id: "DGS30", label: "30Y Treasury" },
  { id: "T10Y2Y", label: "10Y-2Y Spread" },
  { id: "CPIAUCSL", label: "CPI (YoY)" },
  { id: "UNRATE", label: "Unemployment Rate" },
] as const;

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
};

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
  source: "cache" | "openbb";
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
  source: "cache" | "openbb";
  results: SeriesPoint[];
}

export interface CurveQueryResult {
  shape: "curve";
  source: "cache" | "openbb";
  results: YieldPoint[];
}

export type DataQueryResult =
  | SnapshotQueryResult
  | TimeseriesQueryResult
  | CurveQueryResult;

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

function symbolFromMoniker(moniker: string): string | null {
  const parts = canonicalMoniker(moniker).split("/");
  const symbol = parts[parts.length - 1]?.toUpperCase();
  return symbol && SERIES_INFO[symbol] ? symbol : null;
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
      const live = await fetchLatestSeriesFromOpenBb(env.openbbUrl, route);
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

  const symbol = symbolFromMoniker(request.moniker);
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
  const requestedSymbol = symbolFromMoniker(normalizedRequest.moniker);
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

  const routePlan = await resolveRoutePlan({
    ...normalizedRequest,
    params: { ...normalizedRequest.params, limit, range: resolvedRange },
  });
  if (!routePlan) {
    throw new DataQueryError(503, "data unavailable");
  }

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

export async function queryData(
  request: DatasetRequest,
  env: DataQueryEnv = defaultEnv(),
): Promise<DataQueryResult> {
  if (request.shape === "snapshot") {
    return querySnapshot(request, env);
  }

  if (request.shape === "timeseries") {
    return queryTimeseries(request, env);
  }

  if (request.shape === "curve") {
    return queryCurve(request, env);
  }

  throw new DataQueryError(
    400,
    `Unsupported shape: ${request.shape satisfies DatasetShape}`,
  );
}
