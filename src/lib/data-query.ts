import { apiUrl } from "@/lib/api-base";

export type DataQueryShape =
  | "snapshot"
  | "timeseries"
  | "curve"
  | "table"
  | "news";

export interface DataQueryRequest {
  moniker: string;
  shape?: DataQueryShape;
  params?: Record<string, string | number | boolean | undefined>;
}

interface DataQueryErrorResponse {
  error?: string;
}

export async function queryData<TResponse>(
  request: DataQueryRequest,
): Promise<TResponse> {
  const response = await fetch(apiUrl("/api/data/query"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const body = (await response.json()) as TResponse & DataQueryErrorResponse;

  if (!response.ok) {
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }

  return body;
}
