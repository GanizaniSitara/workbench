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

export const ROUTE_PLAN_STUBS: RoutePlanStub[] = [
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

export async function resolveRoutePlan(
  request: DatasetRequest,
): Promise<RoutePlan | null> {
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
