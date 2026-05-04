import { Router } from "express";

export const analyticsRouter = Router();

interface BrinsonProxyRequest {
  portfolio_moniker?: unknown;
  benchmark_moniker?: unknown;
  asof_date?: unknown;
  backend?: unknown;
}

interface BrinsonBatchProxyRequest {
  items?: unknown;
  backend?: unknown;
}

type BrinsonPayload = {
  portfolio_moniker: string;
  benchmark_moniker: string;
  asof_date: string;
  backend?: string;
};

type BrinsonBatchPayload = {
  items: Array<Omit<BrinsonPayload, "backend">>;
  backend?: string;
};

type ValidationResult<T> = { ok: true; payload: T } | { ok: false; error: string };

function validateItem(body: unknown, label?: string): ValidationResult<Omit<BrinsonPayload, "backend">> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      error: label ? `${label} must be an object` : "Request body must be an object",
    };
  }
  const candidate = body as BrinsonProxyRequest;

  for (const field of ["portfolio_moniker", "benchmark_moniker", "asof_date"] as const) {
    const value = candidate[field];
    if (typeof value !== "string" || !value.trim()) {
      return { ok: false, error: `${label ? `${label}.` : ""}${field} is required` };
    }
  }

  return {
    ok: true,
    payload: {
      portfolio_moniker: String(candidate.portfolio_moniker),
      benchmark_moniker: String(candidate.benchmark_moniker),
      asof_date: String(candidate.asof_date),
    },
  };
}

function validate(body: unknown): ValidationResult<BrinsonPayload> {
  const item = validateItem(body);
  if (!item.ok) return item;

  const candidate = body as BrinsonProxyRequest;
  if (candidate.backend !== undefined && typeof candidate.backend !== "string") {
    return { ok: false, error: "backend must be a string" };
  }

  const payload: BrinsonPayload = { ...item.payload };
  if (candidate.backend) payload.backend = String(candidate.backend);
  return { ok: true, payload };
}

function validateBatch(body: unknown): ValidationResult<BrinsonBatchPayload> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Request body must be an object" };
  }

  const candidate = body as BrinsonBatchProxyRequest;
  if (!Array.isArray(candidate.items)) {
    return { ok: false, error: "items must be an array" };
  }
  if (candidate.backend !== undefined && typeof candidate.backend !== "string") {
    return { ok: false, error: "backend must be a string" };
  }

  const items: BrinsonBatchPayload["items"] = [];
  for (const [index, rawItem] of candidate.items.entries()) {
    const item = validateItem(rawItem, `items[${index}]`);
    if (!item.ok) return item;
    items.push(item.payload);
  }

  const payload: BrinsonBatchPayload = { items };
  if (candidate.backend) payload.backend = String(candidate.backend);
  return { ok: true, payload };
}

analyticsRouter.post("/brinson", async (req, res) => {
  const parsed = validate(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }

  const resolverUrl = process.env.ANALYTICS_BASE_URL?.trim();
  if (!resolverUrl) {
    return res.status(503).json({
      error: "ANALYTICS_BASE_URL is not configured; analytics requires the open-moniker-engines service",
    });
  }

  const upstream = new URL(resolverUrl);
  upstream.pathname = `${upstream.pathname.replace(/\/+$/, "")}/analytics/brinson`;

  try {
    const response = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(parsed.payload),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json();
    return res.status(response.status).json(body);
  } catch (error) {
    return res.status(502).json({
      error: "analytics upstream unreachable",
      detail: error instanceof Error ? error.message : String(error),
      resolverUrl,
    });
  }
});

analyticsRouter.post("/brinson/batch", async (req, res) => {
  const parsed = validateBatch(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }

  const resolverUrl = process.env.ANALYTICS_BASE_URL?.trim();
  if (!resolverUrl) {
    return res.status(503).json({
      error: "ANALYTICS_BASE_URL is not configured; analytics requires the open-moniker-engines service",
    });
  }

  const upstream = new URL(resolverUrl);
  upstream.pathname = `${upstream.pathname.replace(/\/+$/, "")}/analytics/brinson/batch`;

  try {
    const response = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(parsed.payload),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.json();
    return res.status(response.status).json(body);
  } catch (error) {
    return res.status(502).json({
      error: "analytics upstream unreachable",
      detail: error instanceof Error ? error.message : String(error),
      resolverUrl,
    });
  }
});
