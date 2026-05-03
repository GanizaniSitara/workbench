import { apiUrl } from "@/lib/api-base";

export interface BrinsonRequest {
  portfolio_moniker: string;
  benchmark_moniker: string;
  asof_date: string;
  backend?: string;
}

export interface BrinsonBatchItem {
  portfolio_moniker: string;
  benchmark_moniker: string;
  asof_date: string;
}

export interface BrinsonBatchRequest {
  items: BrinsonBatchItem[];
  backend?: string;
}

export interface BrinsonEffect {
  value_bps: number;
  contribution: number;
}

export interface BrinsonSectorRow {
  sector: string;
  allocation_bps: number;
  selection_bps: number;
  weight_port: number;
  weight_bench: number;
}

export interface BrinsonResponse {
  asof_date: string;
  portfolio_moniker: string;
  benchmark_moniker: string;
  total_active_return_bps: number;
  effects: {
    yield_income: BrinsonEffect;
    rates_parallel: BrinsonEffect;
    rates_curve: BrinsonEffect;
    spread_allocation: BrinsonEffect;
    selection: BrinsonEffect;
    residual: BrinsonEffect;
  };
  by_sector: BrinsonSectorRow[];
  backend: string;
  engine_version: string;
  fixture_mode: boolean;
}

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

export type BrinsonBatchResponse = BrinsonResponse[];

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
