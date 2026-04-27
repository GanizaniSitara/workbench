import { Router } from "express";
import {
  fetchLatestSeriesFromOpenBb,
  fetchSeriesFromOpenBb,
  fetchYieldCurveFromOpenBb,
} from "../data-router/adapters/openbb";
import {
  fetchLatestSeriesFromQuestDb,
  fetchSeriesFromQuestDb,
  fetchYieldCurveFromQuestDb,
  type SeriesPoint,
} from "../data-router/adapters/questdb";
import { executeRoutePlan } from "../data-router/data-router";
import { resolveRoutePlan } from "../data-router/route-plan-resolver";

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

export const marketRouter = Router();

marketRouter.get("/macro", async (req, res) => {
  const domain =
    typeof req.query.moniker === "string"
      ? req.query.moniker
      : "macro.indicators";
  const questdbUrl = process.env.QUESTDB_URL;
  const openbbUrl = process.env.OPENBB_BASE_URL;

  const fetches = MACRO_SERIES.map(
    async ({ id, label }): Promise<SeriesResult> => {
      const routePlan = await resolveRoutePlan({
        moniker: `${domain}/${id}/date@latest`,
        shape: "snapshot",
        params: { limit: 1 },
      });
      if (!routePlan) {
        return {
          id,
          label,
          value: null,
          date: null,
          error: "data unavailable",
        };
      }

      const routed = await executeRoutePlan<SeriesResult>(routePlan, {
        questdb: async (route) => {
          if (!questdbUrl) return null;
          const cached = await fetchLatestSeriesFromQuestDb(questdbUrl, route);
          return cached ? { id, label, ...cached, source: "cache" } : null;
        },
        openbb: async (route) => {
          if (!openbbUrl) return null;
          const live = await fetchLatestSeriesFromOpenBb(openbbUrl, route);
          return { id, label, ...live, source: "openbb" };
        },
      });

      if (routed) return routed.data;

      return { id, label, value: null, date: null, error: "data unavailable" };
    },
  );

  const results = await Promise.all(fetches);
  res.json({ results });
});

marketRouter.get("/series", async (req, res) => {
  const requestedSymbol =
    typeof req.query.symbol === "string"
      ? req.query.symbol.toUpperCase()
      : "DGS10";
  const range = typeof req.query.range === "string" ? req.query.range : "3m";
  const domain =
    typeof req.query.moniker === "string"
      ? req.query.moniker
      : "macro.indicators";
  const series = SERIES_INFO[requestedSymbol];

  if (!series) {
    return res
      .status(400)
      .json({ error: `Unsupported series: ${requestedSymbol}` });
  }

  const resolvedRange = RANGE_LIMITS[range] ? range : "3m";
  const limit = RANGE_LIMITS[resolvedRange];
  const questdbUrl = process.env.QUESTDB_URL;
  const openbbUrl = process.env.OPENBB_BASE_URL;

  if (!questdbUrl && !openbbUrl) {
    return res
      .status(503)
      .json({ error: "Neither QUESTDB_URL nor OPENBB_BASE_URL is configured" });
  }

  const routePlan = await resolveRoutePlan({
    moniker: `${domain}/${requestedSymbol}/date@latest`,
    shape: "timeseries",
    params: { limit, range: resolvedRange },
  });
  if (!routePlan) {
    return res.status(503).json({ error: "data unavailable" });
  }

  const routed = await executeRoutePlan<SeriesRouteResult>(routePlan, {
    questdb: async (route) => {
      if (!questdbUrl) return null;
      const cached = await fetchSeriesFromQuestDb(questdbUrl, route, limit);
      return cached ? { results: cached, source: "cache" } : null;
    },
    openbb: async (route) => {
      if (!openbbUrl) return null;
      const live = await fetchSeriesFromOpenBb(openbbUrl, route, limit);
      return live ? { results: live, source: "openbb" } : null;
    },
  });

  if (routed) {
    return res.json({
      symbol: requestedSymbol,
      label: series.label,
      format: series.format,
      range: resolvedRange,
      source: routed.data.source,
      results: routed.data.results,
    });
  }

  return res
    .status(502)
    .json({ error: `No data returned for ${requestedSymbol}` });
});

marketRouter.get("/yields", async (req, res) => {
  const domain =
    typeof req.query.moniker === "string"
      ? req.query.moniker
      : "fixed.income.govies";
  const routePlan = await resolveRoutePlan({
    moniker: `${domain}/date@latest`,
    shape: "curve",
  });
  if (!routePlan) {
    return res.status(503).json({ error: "data unavailable" });
  }

  const questdbUrl = process.env.QUESTDB_URL;
  const openbbUrl = process.env.OPENBB_BASE_URL;

  const routed = await executeRoutePlan<unknown>(routePlan, {
    questdb: async (route) => {
      if (!questdbUrl) return null;
      const curve = await fetchYieldCurveFromQuestDb(questdbUrl, route);
      return curve ? { results: curve, source: "cache" } : null;
    },
    openbb: async (route) => {
      if (!openbbUrl) return null;
      return fetchYieldCurveFromOpenBb(openbbUrl, route);
    },
  });

  if (routed) return res.json(routed.data);

  return res.status(503).json({ error: "data unavailable" });
});
