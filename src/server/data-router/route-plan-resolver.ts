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

const REFERENCE_RATE_CONFIGS: Record<
  string,
  { endpoint: string; provider: string }
> = {
  SONIA: { endpoint: "/api/v1/fixedincome/rate/sonia", provider: "fred" },
  SOFR: {
    endpoint: "/api/v1/fixedincome/rate/sofr",
    provider: "federal_reserve",
  },
  ESTR: { endpoint: "/api/v1/fixedincome/rate/estr", provider: "ecb" },
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
  "refinitiv",
  "direct-db",
]);

const FALLBACK_POLICIES = new Set<RoutePlan["policy"]["fallback"]>([
  "ordered",
  "none",
]);

export const ROUTE_PLAN_STUBS: RoutePlanStub[] = [
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
  if (!isRecord(value) || value.shape !== request.shape) return null;
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
    shape: request.shape,
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
    url.searchParams.set("shape", request.shape);

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
    if (!stub.shapes.includes(request.shape)) continue;

    const context = stub.match(canonical, request);
    if (!context) continue;

    return {
      moniker: request.moniker,
      shape: request.shape,
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

export interface RoutePlanDiagnostics {
  plan: RoutePlan | null;
  mode: "live" | "stub" | "stub-fallback" | "unavailable";
  resolverUrl?: string;
}

export async function resolveRoutePlanDiagnostics(
  request: DatasetRequest,
): Promise<RoutePlanDiagnostics> {
  const resolverUrl = process.env.MONIKER_RESOLVER_URL?.trim();
  if (resolverUrl) {
    const livePlan = await resolveLiveRoutePlan(request, resolverUrl);
    if (livePlan) {
      return { plan: livePlan, mode: "live", resolverUrl };
    }

    const stubPlan = resolveStubRoutePlan(request);
    return {
      plan: stubPlan,
      mode: stubPlan ? "stub-fallback" : "unavailable",
      resolverUrl,
    };
  }

  const stubPlan = resolveStubRoutePlan(request);
  return { plan: stubPlan, mode: stubPlan ? "stub" : "unavailable" };
}
