import { apiUrl } from "@/lib/api-base";
import type { components, operations } from "@/lib/generated/engines";

/**
 * Types in this file are sourced from `open-moniker-engines`'s OpenAPI
 * schema via `npm run codegen:engines`. Do not edit them by hand — change
 * the Pydantic models in the engines repo and re-run codegen.
 */

export type BrinsonRequest = components["schemas"]["BrinsonRequest"];
export type BrinsonResponse = components["schemas"]["BrinsonResponse"];
export type BrinsonEffect = components["schemas"]["EffectValue"];
export type BrinsonSectorRow = components["schemas"]["SectorRow"];
export type BrinsonBatchItem = components["schemas"]["BatchItem"];
export type BrinsonBatchRequest = components["schemas"]["BrinsonBatchRequest"];
export type BrinsonBatchResponse =
  operations["post_batch_analytics_brinson_batch_post"]["responses"][200]["content"]["application/json"];

export async function runBrinson(req: BrinsonRequest): Promise<BrinsonResponse> {
  const response = await fetch(apiUrl("/api/analytics/brinson"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const body = (await response.json()) as BrinsonResponse & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }
  return body;
}

export async function runBrinsonBatch(req: BrinsonBatchRequest): Promise<BrinsonBatchResponse> {
  const response = await fetch(apiUrl("/api/analytics/brinson/batch"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const body = (await response.json()) as BrinsonBatchResponse & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }
  return body;
}

export const FIXED_INCOME_PORTFOLIO_MONIKERS: string[] = [
  "portfolio.fixed-income/active-sovereign",
  "fixed.income/govies/sovereign",
  "fixed.income.govies",
];

export const FIXED_INCOME_BENCHMARK_MONIKERS: string[] = [
  "benchmarks/fixed-income/global-sovereign-ig",
  "benchmarks/fixed-income/treasury-1-3y",
  "fixed.income.govies",
];
