export type DatasetShape =
  | "snapshot"
  | "timeseries"
  | "curve"
  | "table"
  | "news";

export type RouteSource = "questdb" | "openbb" | "refinitiv" | "direct-db";

export interface DatasetRequest {
  moniker: string;
  shape: DatasetShape;
  params?: Record<string, string | number | boolean | undefined>;
}

export interface RouteStep {
  source: RouteSource;
  ref: Record<string, string | number | boolean>;
}

export interface RoutePlan {
  moniker: string;
  shape: DatasetShape;
  routes: RouteStep[];
  policy: {
    fallback: "ordered" | "none";
    ttlSeconds?: number;
  };
}
