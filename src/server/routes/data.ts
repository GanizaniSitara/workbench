import { Router } from "express";
import { DataQueryError, queryData } from "../data-router/query-service";
import type { DatasetRequest, DatasetShape } from "../data-router/route-plan";

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
