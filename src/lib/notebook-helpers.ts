import { queryData } from "@/lib/data-query";

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface YieldPoint {
  maturity: string;
  rate: number;
}

export interface SnapshotItem {
  id: string;
  label: string;
  value: number | null;
  date: string | null;
}

// wbn — data-router helpers injected into notebook code cells.
// Each method calls the workbench /api/data/query endpoint via the existing
// data router, so credentials and provider config stay server-side.
export const wbn = {
  async query<T = unknown>(moniker: string, params?: Record<string, string | number | boolean>): Promise<T[]> {
    const result = await queryData<{ results: T[] }>({
      moniker,
      params,
    });
    return result.results ?? [];
  },

  // Time series for a FRED macro symbol, e.g. wbn.fred("DGS10", { range: "1y" })
  async fred(symbol: string, params?: { range?: string }): Promise<SeriesPoint[]> {
    return this.query<SeriesPoint>(`macro.indicators/${symbol}`, {
      symbol,
      range: params?.range ?? "1y",
    });
  },

  // Latest snapshot of all FRED macro indicators, e.g. wbn.snapshot()
  async snapshot(): Promise<SnapshotItem[]> {
    return this.query<SnapshotItem>("macro.indicators");
  },

  // Equity price history, e.g. wbn.equity("AAPL", { range: "3m" })
  async equity(symbol: string, params?: { range?: string }): Promise<SeriesPoint[]> {
    return this.query<SeriesPoint>(`equity.prices/${symbol}`, {
      range: params?.range ?? "1y",
    });
  },

  // US Treasury yield curve, e.g. wbn.curve()
  async curve(): Promise<YieldPoint[]> {
    return this.query<YieldPoint>("fixed.income.govies");
  },

  // Reference rates snapshot (SONIA, SOFR, ESTR, EFFR), e.g. wbn.rates()
  async rates(): Promise<SnapshotItem[]> {
    return this.query<SnapshotItem>("reference.rates");
  },
};
