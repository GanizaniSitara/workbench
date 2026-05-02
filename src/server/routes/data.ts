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

  if (
    shape !== undefined &&
    (typeof shape !== "string" || !DATASET_SHAPES.has(shape as DatasetShape))
  ) {
    return { ok: false, error: "shape is invalid" };
  }

  return {
    ok: true,
    request: {
      moniker,
      shape: shape as DatasetShape | undefined,
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

  if (
    shape !== undefined &&
    (typeof shape !== "string" || !DATASET_SHAPES.has(shape as DatasetShape))
  ) {
    return res.status(400).json({ error: "shape is invalid" });
  }

  try {
    const diagnostics = await resolveRoutePlanDiagnostics({
      moniker,
      shape: shape as DatasetShape | undefined,
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
  { symbol: "BAMLC0A0CM",         label: "ICE BofA US Corporate OAS",        kind: "macro" },
  { symbol: "BAMLH0A0HYM2",       label: "ICE BofA US High Yield OAS",       kind: "macro" },
  { symbol: "BAMLC0A0CMEY",       label: "ICE BofA US Corporate Yield",      kind: "macro" },
  { symbol: "BAMLH0A0HYM2EY",     label: "ICE BofA US High Yield Yield",     kind: "macro" },
  { symbol: "BAMLCC0A0CMTRIV",    label: "ICE BofA US Corporate Total Return", kind: "macro" },
  { symbol: "BAMLHYH0A0HYM2TRIV", label: "ICE BofA US High Yield Total Return", kind: "macro" },
  { symbol: "BAMLHE00EHYIOAS",    label: "ICE BofA Euro High Yield OAS",     kind: "macro" },
];

const UK_EQUITY_CATALOG: SearchResult[] = [
  { symbol: "^FTSE", label: "FTSE 100 Index", kind: "equity" },
  { symbol: "^FTMC", label: "FTSE 250 Index", kind: "equity" },
  { symbol: "AZN.L", label: "AstraZeneca PLC", kind: "equity" },
  { symbol: "SHEL.L", label: "Shell PLC", kind: "equity" },
  { symbol: "HSBA.L", label: "HSBC Holdings PLC", kind: "equity" },
  { symbol: "ULVR.L", label: "Unilever PLC", kind: "equity" },
  { symbol: "BP.L", label: "BP PLC", kind: "equity" },
  { symbol: "GSK.L", label: "GSK PLC", kind: "equity" },
  { symbol: "BATS.L", label: "British American Tobacco PLC", kind: "equity" },
  { symbol: "RIO.L", label: "Rio Tinto PLC", kind: "equity" },
  { symbol: "GLEN.L", label: "Glencore PLC", kind: "equity" },
  { symbol: "DGE.L", label: "Diageo PLC", kind: "equity" },
  { symbol: "NG.L", label: "National Grid PLC", kind: "equity" },
  { symbol: "BARC.L", label: "Barclays PLC", kind: "equity" },
  { symbol: "LLOY.L", label: "Lloyds Banking Group PLC", kind: "equity" },
  { symbol: "RR.L", label: "Rolls-Royce Holdings PLC", kind: "equity" },
  { symbol: "BA.L", label: "BAE Systems PLC", kind: "equity" },
  { symbol: "LSEG.L", label: "London Stock Exchange Group PLC", kind: "equity" },
  { symbol: "REL.L", label: "RELX PLC", kind: "equity" },
  { symbol: "CPG.L", label: "Compass Group PLC", kind: "equity" },
  { symbol: "HLN.L", label: "Haleon PLC", kind: "equity" },
  { symbol: "LGEN.L", label: "Legal & General Group PLC", kind: "equity" },
  { symbol: "AV.L", label: "Aviva PLC", kind: "equity" },
  { symbol: "NWG.L", label: "NatWest Group PLC", kind: "equity" },
  { symbol: "STAN.L", label: "Standard Chartered PLC", kind: "equity" },
  { symbol: "VOD.L", label: "Vodafone Group PLC", kind: "equity" },
  { symbol: "TSCO.L", label: "Tesco PLC", kind: "equity" },
  { symbol: "BT-A.L", label: "BT Group PLC", kind: "equity" },
];

function catalogMatches(item: SearchResult, q: string): boolean {
  return item.symbol.includes(q) || item.label.toUpperCase().includes(q);
}

function dedupeSearchResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${result.kind}:${result.symbol.toUpperCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

dataRouter.get("/search", async (req, res) => {
  const raw = req.query.q;
  const q = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (!q || q.length < 1) {
    return res.json({ results: [] });
  }

  // FRED matches — filter client-side from catalog
  const fredMatches = FRED_CATALOG.filter((item) =>
    catalogMatches(item, q),
  ).slice(0, 10);
  const ukEquityMatches = UK_EQUITY_CATALOG.filter((item) =>
    catalogMatches(item, q),
  ).slice(0, 12);

  // Equity search via OpenBB — optional, skip if not configured
  const equityMatches: SearchResult[] = [];
  const openbbBase = process.env.OPENBB_BASE_URL?.trim();
  if (openbbBase) {
    for (const provider of ["yfinance", "sec"]) {
      try {
        const url = `${openbbBase}/api/v1/equity/search?query=${encodeURIComponent(q)}&provider=${provider}`;
        const response = await fetch(url, {
          signal: AbortSignal.timeout(4_000),
        });
        if (response.ok) {
          const body = await response.json() as { results?: Array<{ symbol?: string; name?: string }> };
          equityMatches.push(
            ...(body.results ?? [])
              .filter((r) => r.symbol)
              .slice(0, 16)
              .map((r) => ({
                symbol: String(r.symbol).toUpperCase(),
                label: r.name ?? String(r.symbol),
                kind: "equity" as const,
              })),
          );
        }
      } catch {
        // Provider unavailable — skip to the next search provider.
      }
    }
  }

  // FRED results first, then curated UK equity, then live equity search.
  const results: SearchResult[] = dedupeSearchResults([
    ...fredMatches,
    ...ukEquityMatches,
    ...equityMatches,
  ]).slice(0, 24);
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
