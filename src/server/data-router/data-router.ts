import type { RoutePlan, RouteSource, RouteStep } from "./route-plan";

export type RouteHandler<T> = (step: RouteStep) => Promise<T | null>;

export type RouteHandlers<T> = Partial<Record<RouteSource, RouteHandler<T>>>;

export interface DataRouterResult<T> {
  data: T;
  source: RouteSource;
  route: RouteStep;
}

export async function executeRoutePlan<T>(
  plan: RoutePlan,
  handlers: RouteHandlers<T>,
): Promise<DataRouterResult<T> | null> {
  for (const route of plan.routes) {
    const handler = handlers[route.source];
    const data = handler ? await handler(route) : null;
    if (data) return { data, source: route.source, route };
    if (plan.policy.fallback !== "ordered") return null;
  }

  return null;
}
