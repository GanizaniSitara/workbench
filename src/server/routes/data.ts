import { Router } from "express";
import { DataQueryError, queryData } from "../data-router/query-service";
import type { DatasetRequest, DatasetShape } from "../data-router/route-plan";
import { resolveRoutePlanDiagnostics } from "../data-router/route-plan-resolver";

const DATASET_SHAPES = new Set<DatasetShape>([
  "snapshot",
  "timeseries",
  "curve",
  "table",
  "news",
]);

type QueryParseResult =
  | { ok: true; request: DatasetRequest }
  | { ok: false; error: string };

export const dataRouter = Router();

function parseParams(value: unknown): DatasetRequest["params"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) =>
      typeof entry === "number"
        ? Number.isFinite(entry)
        : ["string", "boolean"].includes(typeof entry),
    ),
  ) as DatasetRequest["params"];
}

function parseDataQueryRequest(body: unknown): QueryParseResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Request body must be an object" };
  }

  const candidate = body as Record<string, unknown>;
  const moniker = candidate.moniker;
  const shape = candidate.shape;

  if (typeof moniker !== "string" || !moniker.trim()) {
    return { ok: false, error: "moniker is required" };
  }

  if (typeof shape !== "string" || !DATASET_SHAPES.has(shape as DatasetShape)) {
    return { ok: false, error: "shape is invalid" };
  }

  return {
    ok: true,
    request: {
      moniker,
      shape: shape as DatasetShape,
      params: parseParams(candidate.params),
    },
  };
}

dataRouter.post("/query", async (req, res) => {
  const parsed = parseDataQueryRequest(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }

  try {
    const result = await queryData(parsed.request);
    return res.json(result);
  } catch (error) {
    if (error instanceof DataQueryError) {
      return res.status(error.status).json({ error: error.message });
    }

    return res.status(500).json({ error: "data query failed" });
  }
});

dataRouter.get("/route-plan", async (req, res) => {
  const moniker = req.query.moniker;
  const shape = req.query.shape;

  if (typeof moniker !== "string" || !moniker.trim()) {
    return res.status(400).json({ error: "moniker is required" });
  }

  if (typeof shape !== "string" || !DATASET_SHAPES.has(shape as DatasetShape)) {
    return res.status(400).json({ error: "shape is invalid" });
  }

  try {
    const diagnostics = await resolveRoutePlanDiagnostics({
      moniker,
      shape: shape as DatasetShape,
    });

    if (!diagnostics.plan) {
      return res.status(404).json({
        error: "route plan unavailable",
        mode: diagnostics.mode,
        resolverUrl: diagnostics.resolverUrl,
      });
    }

    return res.json(diagnostics);
  } catch {
    return res.status(500).json({ error: "route plan diagnostics failed" });
  }
});

// ---------------------------------------------------------------------------
// Symbol search — used by the overlay chart autocomplete
// ---------------------------------------------------------------------------

interface SearchResult {
  symbol: string;
  label: string;
  kind: "macro" | "equity";
}

const FRED_CATALOG: SearchResult[] = [
  { symbol: "DGS1MO",   label: "1-Month Treasury Yield",           kind: "macro" },
  { symbol: "DGS3MO",   label: "3-Month Treasury Yield",           kind: "macro" },
  { symbol: "DGS6MO",   label: "6-Month Treasury Yield",           kind: "macro" },
  { symbol: "DGS1",     label: "1-Year Treasury Yield",            kind: "macro" },
  { symbol: "DGS2",     label: "2-Year Treasury Yield",            kind: "macro" },
  { symbol: "DGS5",     label: "5-Year Treasury Yield",            kind: "macro" },
  { symbol: "DGS10",    label: "10-Year Treasury Yield",           kind: "macro" },
  { symbol: "DGS20",    label: "20-Year Treasury Yield",           kind: "macro" },
  { symbol: "DGS30",    label: "30-Year Treasury Yield",           kind: "macro" },
  { symbol: "T10Y2Y",   label: "10Y-2Y Treasury Spread",           kind: "macro" },
  { symbol: "FEDFUNDS", label: "Effective Federal Funds Rate",     kind: "macro" },
  { symbol: "UNRATE",   label: "Unemployment Rate",                kind: "macro" },
  { symbol: "CPIAUCSL", label: "CPI All Items (FRED)",             kind: "macro" },
];

dataRouter.get("/search", async (req, res) => {
  const raw = req.query.q;
  const q = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (!q || q.length < 1) {
    return res.json({ results: [] });
  }

  // FRED matches — filter client-side from catalog
  const fredMatches = FRED_CATALOG.filter(
    (item) =>
      item.symbol.includes(q) ||
      item.label.toUpperCase().includes(q),
  ).slice(0, 6);

  // Equity search via OpenBB — optional, skip if not configured
  let equityMatches: SearchResult[] = [];
  const openbbBase = process.env.OPENBB_BASE_URL?.trim();
  if (openbbBase) {
    try {
      const url = `${openbbBase}/api/v1/equity/search?query=${encodeURIComponent(q)}&provider=sec`;
      const response = await fetch(url, { signal: AbortSignal.timeout(4_000) });
      if (response.ok) {
        const body = await response.json() as { results?: Array<{ symbol?: string; name?: string }> };
        equityMatches = (body.results ?? [])
          .filter((r) => r.symbol)
          .slice(0, 8)
          .map((r) => ({
            symbol: String(r.symbol).toUpperCase(),
            label: r.name ?? String(r.symbol),
            kind: "equity" as const,
          }));
      }
    } catch {
      // OpenBB unavailable — equity results stay empty
    }
  }

  // FRED results first, then equity
  const results: SearchResult[] = [...fredMatches, ...equityMatches].slice(0, 12);
  return res.json({ results });
});

dataRouter.get("/moniker-tree", async (_req, res) => {
  const resolverUrl = process.env.MONIKER_RESOLVER_URL?.trim();
  if (!resolverUrl) {
    return res
      .status(503)
      .json({ error: "MONIKER_RESOLVER_URL is not configured" });
  }

  try {
    const url = new URL(resolverUrl);
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/tree`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    const tree = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Open Moniker tree unavailable",
        detail: tree,
      });
    }

    return res.json({
      resolverUrl,
      tree,
    });
  } catch {
    return res.status(502).json({ error: "Open Moniker tree unavailable" });
  }
});
