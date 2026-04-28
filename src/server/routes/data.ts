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
