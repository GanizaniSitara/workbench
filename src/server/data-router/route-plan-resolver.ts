import type {
  DatasetRequest,
  DatasetShape,
  RoutePlan,
  RouteStep,
} from "./route-plan";

const SERIES_SYMBOLS = new Set([
  "FEDFUNDS",
  "DGS2",
  "DGS10",
  "DGS30",
  "T10Y2Y",
  "CPIAUCSL",
  "UNRATE",
]);

const CORPORATE_BOND_SYMBOLS = new Set([
  "BAMLC0A0CM",
  "BAMLH0A0HYM2",
  "BAMLC0A0CMEY",
  "BAMLH0A0HYM2EY",
  "BAMLCC0A0CMTRIV",
  "BAMLHYH0A0HYM2TRIV",
  "BAMLHE00EHYIOAS",
]);

const REFERENCE_RATE_CONFIGS: Record<
  string,
  { endpoint: string; provider: string }
> = {
  SONIA: { endpoint: "/api/v1/fixedincome/rate/sonia", provider: "fred" },
  SOFR: {
    endpoint: "/api/v1/fixedincome/rate/sofr",
    provider: "federal_reserve",
  },
  ESTR: { endpoint: "/api/v1/fixedincome/rate/estr", provider: "fred" },
  EFFR: {
    endpoint: "/api/v1/fixedincome/rate/effr",
    provider: "federal_reserve",
  },
};

function canonicalMoniker(moniker: string): string {
  return moniker.replace(/\/date@[^/]*/g, "").replace(/\/filter@[^/]*/g, "");
}

type RouteContext = Record<string, string | number | boolean>;
type RouteRefTemplateValue =
  | string
  | number
  | boolean
  | {
      from: "context" | "param";
      name: string;
      default?: string | number | boolean;
    };

interface RouteStepTemplate {
  source: RouteStep["source"];
  ref: Record<string, RouteRefTemplateValue>;
}

interface RoutePlanStub {
  id: string;
  shapes: DatasetShape[];
  match: (canonical: string, request: DatasetRequest) => RouteContext | null;
  routes: RouteStepTemplate[];
  policy: RoutePlan["policy"];
}

const ROUTE_SOURCES = new Set<RouteStep["source"]>([
  "questdb",
  "openbb",
  "gdelt",
  "refinitiv",
  "direct-db",
  "portfolio-adapter",
]);

const DATASET_SHAPES = new Set<DatasetShape>([
  "snapshot",
  "timeseries",
  "curve",
  "table",
  "news",
]);

const FALLBACK_POLICIES = new Set<RoutePlan["policy"]["fallback"]>([
  "ordered",
  "none",
]);

export const ROUTE_PLAN_STUBS: RoutePlanStub[] = [
  {
    id: "portfolio-positions",
    shapes: ["table"],
    match: (canonical) =>
      canonical === "portfolio.positions" ? { kind: "positions" } : null,
    routes: [
      {
        source: "portfolio-adapter",
        ref: { kind: { from: "context", name: "kind" } },
      },
    ],
    policy: { fallback: "none", ttlSeconds: 30 },
  },
  {
    id: "portfolio-summary",
    shapes: ["snapshot"],
    match: (canonical) =>
      canonical === "portfolio.summary" ? { kind: "summary" } : null,
    routes: [
      {
        source: "portfolio-adapter",
        ref: { kind: { from: "context", name: "kind" } },
      },
    ],
    policy: { fallback: "none", ttlSeconds: 30 },
  },
  {
    id: "portfolio-exposure",
    shapes: ["snapshot"],
    match: (canonical) =>
      canonical === "portfolio.exposure" ? { kind: "exposure" } : null,
    routes: [
      {
        source: "portfolio-adapter",
        ref: { kind: { from: "context", name: "kind" } },
      },
    ],
    policy: { fallback: "none", ttlSeconds: 30 },
  },
  {
    id: "portfolio-position",
    shapes: ["snapshot"],
    match: (canonical) => {
      const parts = canonical.split("/");
      return parts[0] === "portfolio.position" && parts.length === 2
        ? { kind: "position", id: parts[1] }
        : null;
    },
    routes: [
      {
        source: "portfolio-adapter",
        ref: {
          kind: { from: "context", name: "kind" },
          id: { from: "context", name: "id" },
        },
      },
    ],
    policy: { fallback: "none", ttlSeconds: 30 },
  },
  {
    id: "portfolio-position-pnl-history",
    shapes: ["timeseries"],
    match: (canonical) => {
      const parts = canonical.split("/");
      return parts[0] === "portfolio.position" &&
        parts.length === 3 &&
        parts[2] === "pnl-history"
        ? { kind: "pnl-history", id: parts[1] }
        : null;
    },
    routes: [
      {
        source: "portfolio-adapter",
        ref: {
          kind: { from: "context", name: "kind" },
          id: { from: "context", name: "id" },
        },
      },
    ],
    policy: { fallback: "none", ttlSeconds: 30 },
  },
  {
    id: "vix-equity",
    shapes: ["snapshot"],
    match: (canonical) => {
      const parts = canonical.split("/");
      const symbol = parts[parts.length - 1]?.toUpperCase();
      return parts[0] === "macro.indicators" && symbol === "VIXCLS"
        ? { symbol: "^VIX" }
        : null;
    },
    routes: [
      {
        source: "openbb",
        ref: {
          endpoint: "/api/v1/equity/price/historical",
          provider: "yfinance",
          symbol: { from: "context", name: "symbol" },
        },
      },
    ],
    policy: { fallback: "ordered", ttlSeconds: 300 },
  },
  {
    id: "fred-series",
    shapes: ["snapshot", "timeseries"],
    match: (canonical) => {
      const parts = canonical.split("/");
      const symbol = parts[parts.length - 1];

      if (parts[0] !== "macro.indicators" || !SERIES_SYMBOLS.has(symbol)) {
        return null;
      }

      return { symbol };
    },
    routes: [
      {
        source: "questdb",
        ref: {
          table: "fred_series",
          symbol: { from: "context", name: "symbol" },
          limit: { from: "param", name: "limit", default: 1 },
        },
      },
      {
        source: "openbb",
        ref: {
          endpoint: "/api/v1/economy/fred_series",
          provider: "fred",
          symbol: { from: "context", name: "symbol" },
          limit: { from: "param", name: "limit", default: 1 },
        },
      },
    ],
    policy: {
      fallback: "ordered",
      ttlSeconds: 300,
    },
  },
  {
    id: "corporate-bonds-fred-series",
    shapes: ["timeseries"],
    match: (canonical) => {
      const parts = canonical.split("/");
      const symbol = parts[parts.length - 1];

      if (
        parts[0] !== "corporate.bonds" ||
        !CORPORATE_BOND_SYMBOLS.has(symbol)
      ) {
        return null;
      }

      return { symbol };
    },
    routes: [
      {
        source: "questdb",
        ref: {
          table: "fred_series",
          symbol: { from: "context", name: "symbol" },
          limit: { from: "param", name: "limit", default: 252 },
        },
      },
      {
        source: "openbb",
        ref: {
          endpoint: "/api/v1/economy/fred_series",
          provider: "fred",
          symbol: { from: "context", name: "symbol" },
          limit: { from: "param", name: "limit", default: 252 },
        },
      },
    ],
    policy: {
      fallback: "ordered",
      ttlSeconds: 300,
    },
  },
  {
    id: "us-yield-curve",
    shapes: ["curve"],
    match: (canonical) =>
      canonical === "fixed.income.govies" ? { group: "us_yield_curve" } : null,
    routes: [
      {
        source: "questdb",
        ref: {
          table: "fred_series",
          group: { from: "context", name: "group" },
        },
      },
      {
        source: "openbb",
        ref: {
          endpoint: "/api/v1/fixedincome/government/yield_curve",
          provider: "fred",
        },
      },
    ],
    policy: {
      fallback: "ordered",
      ttlSeconds: 60,
    },
  },
  {
    id: "reference-rate",
    shapes: ["snapshot"],
    match: (canonical) => {
      const parts = canonical.split("/");
      if (parts[0] !== "reference.rates" || parts.length !== 2) return null;
      const symbol = parts[1].toUpperCase();
      const config = REFERENCE_RATE_CONFIGS[symbol];
      return config ? { symbol, ...config } : null;
    },
    routes: [
      {
        source: "openbb",
        ref: {
          endpoint: { from: "context", name: "endpoint" },
          provider: { from: "context", name: "provider" },
        },
      },
    ],
    policy: { fallback: "ordered", ttlSeconds: 300 },
  },
  {
    id: "equity-price",
    shapes: ["timeseries"],
    match: (canonical) => {
      const parts = canonical.split("/");
      if (parts[0] !== "equity.prices" || !parts[1]) return null;
      return { symbol: parts[1].toUpperCase() };
    },
    routes: [
      {
        source: "openbb",
        ref: {
          endpoint: "/api/v1/equity/price/historical",
          provider: "yfinance",
          symbol: { from: "context", name: "symbol" },
          limit: { from: "param", name: "limit", default: 252 },
        },
      },
    ],
    policy: { fallback: "ordered", ttlSeconds: 60 },
  },
  {
    id: "gdelt-news",
    shapes: ["news"],
    match: (canonical) =>
      canonical === "news/gdelt" || canonical === "news.gdelt"
        ? { provider: "gdelt" }
        : null,
    routes: [
      {
        source: "gdelt",
        ref: {
          provider: { from: "context", name: "provider" },
          topic: { from: "param", name: "topic", default: "markets" },
          query: { from: "param", name: "query", default: "" },
          timespan: { from: "param", name: "timespan", default: "24h" },
          sort: { from: "param", name: "sort", default: "hybridrel" },
          limit: { from: "param", name: "limit", default: 8 },
        },
      },
    ],
    policy: { fallback: "none", ttlSeconds: 300 },
  },
];

function resolveRefValue(
  value: RouteRefTemplateValue,
  request: DatasetRequest,
  context: RouteContext,
): string | number | boolean {
  if (typeof value !== "object") return value;

  const source = value.from === "context" ? context : request.params;
  const resolved = source?.[value.name] ?? value.default;

  if (resolved === undefined) {
    throw new Error(`Route plan template missing value for ${value.name}`);
  }

  return resolved;
}

function materializeRoute(
  route: RouteStepTemplate,
  request: DatasetRequest,
  context: RouteContext,
): RouteStep {
  return {
    source: route.source,
    ref: Object.fromEntries(
      Object.entries(route.ref).map(([key, value]) => [
        key,
        resolveRefValue(value, request, context),
      ]),
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isRouteRefValue(value: unknown): value is string | number | boolean {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function coerceRoutePlan(
  value: unknown,
  request: DatasetRequest,
): RoutePlan | null {
  if (!isRecord(value) || !DATASET_SHAPES.has(value.shape as DatasetShape)) {
    return null;
  }
  const shape = value.shape as DatasetShape;
  if (request.shape && shape !== request.shape) return null;
  if (!Array.isArray(value.routes) || value.routes.length === 0) return null;
  if (
    !isRecord(value.policy) ||
    !FALLBACK_POLICIES.has(
      value.policy.fallback as RoutePlan["policy"]["fallback"],
    )
  ) {
    return null;
  }

  const routes: RouteStep[] = [];
  for (const route of value.routes) {
    if (
      !isRecord(route) ||
      !ROUTE_SOURCES.has(route.source as RouteStep["source"])
    ) {
      return null;
    }

    if (!isRecord(route.ref)) return null;
    const refEntries = Object.entries(route.ref);
    if (!refEntries.every(([, entry]) => isRouteRefValue(entry))) {
      return null;
    }

    routes.push({
      source: route.source as RouteStep["source"],
      ref: Object.fromEntries(refEntries) as RouteStep["ref"],
    });
  }

  const ttlSeconds = value.policy.ttlSeconds;
  const policy: RoutePlan["policy"] = {
    fallback: value.policy.fallback as RoutePlan["policy"]["fallback"],
  };
  if (typeof ttlSeconds === "number" && Number.isFinite(ttlSeconds)) {
    policy.ttlSeconds = ttlSeconds;
  }

  return {
    moniker:
      typeof value.moniker === "string" ? value.moniker : request.moniker,
    shape,
    routes,
    policy,
  };
}

function routePlanUrl(
  resolverUrl: string,
  request: DatasetRequest,
): string | null {
  try {
    const url = new URL(resolverUrl);
    const path = url.pathname.replace(/\/+$/, "");
    if (!path.endsWith("/route-plan") && !path.endsWith("/route-plans")) {
      url.pathname = `${path}/route-plan`;
    } else {
      url.pathname = path;
    }

    url.searchParams.set("moniker", request.moniker);
    if (request.shape) {
      url.searchParams.set("shape", request.shape);
    }

    for (const [key, value] of Object.entries(request.params ?? {})) {
      if (isRouteRefValue(value)) {
        url.searchParams.set(`param.${key}`, String(value));
      }
    }

    return url.toString();
  } catch {
    return null;
  }
}

async function resolveLiveRoutePlan(
  request: DatasetRequest,
  resolverUrl: string,
): Promise<RoutePlan | null> {
  const url = routePlanUrl(resolverUrl, request);
  if (!url) return null;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (response.status === 404) return null;
    if (!response.ok) return null;
    return coerceRoutePlan(await response.json(), request);
  } catch {
    return null;
  }
}

function resolveStubRoutePlan(request: DatasetRequest): RoutePlan | null {
  const canonical = canonicalMoniker(request.moniker);

  for (const stub of ROUTE_PLAN_STUBS) {
    if (request.shape && !stub.shapes.includes(request.shape)) continue;
    if (!request.shape && stub.shapes.length !== 1) continue;

    const context = stub.match(canonical, request);
    if (!context) continue;

    return {
      moniker: request.moniker,
      shape: request.shape ?? stub.shapes[0],
      routes: stub.routes.map((route) =>
        materializeRoute(route, request, context),
      ),
      policy: stub.policy,
    };
  }

  return null;
}

export async function resolveRoutePlan(
  request: DatasetRequest,
): Promise<RoutePlan | null> {
  return (await resolveRoutePlanDiagnostics(request)).plan;
}

export type RoutePlanResolverMode = "direct" | "moniker-service";

export interface RoutePlanDiagnostics {
  plan: RoutePlan | null;
  mode:
    | "direct"
    | "moniker-service"
    | "moniker-service-fallback"
    | "unavailable";
  routingMode: RoutePlanResolverMode;
  resolverUrl?: string;
}

function routePlanResolverMode(): RoutePlanResolverMode {
  const raw = (
    process.env.DATA_ROUTING_MODE ??
    process.env.MONIKER_ROUTING_MODE ??
    ""
  )
    .trim()
    .toLowerCase();

  if (["direct", "local", "stub", "stubs"].includes(raw)) {
    return "direct";
  }

  return ["enterprise", "moniker", "moniker-service", "open-moniker"].includes(
    raw,
  )
    ? "moniker-service"
    : process.env.MONIKER_RESOLVER_URL?.trim()
      ? "moniker-service"
      : "direct";
}

export async function resolveRoutePlanDiagnostics(
  request: DatasetRequest,
): Promise<RoutePlanDiagnostics> {
  const routingMode = routePlanResolverMode();
  const stubPlan = resolveStubRoutePlan(request);

  if (routingMode === "direct") {
    return {
      plan: stubPlan,
      mode: stubPlan ? "direct" : "unavailable",
      routingMode,
    };
  }

  const resolverUrl = process.env.MONIKER_RESOLVER_URL?.trim();
  if (!resolverUrl) {
    return {
      plan: stubPlan,
      mode: stubPlan ? "moniker-service-fallback" : "unavailable",
      routingMode,
    };
  }

  const livePlan = await resolveLiveRoutePlan(request, resolverUrl);
  if (livePlan) {
    return {
      plan: livePlan,
      mode: "moniker-service",
      routingMode,
      resolverUrl,
    };
  }

  return {
    plan: stubPlan,
    mode: stubPlan ? "moniker-service-fallback" : "unavailable",
    routingMode,
    resolverUrl,
  };
}
