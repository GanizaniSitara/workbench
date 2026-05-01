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
  // Time series for a FRED macro symbol, e.g. wbn.fred("DGS10", { range: "1y" })
  async fred(symbol: string, params?: { range?: string }): Promise<SeriesPoint[]> {
    const result = await queryData<{ results: SeriesPoint[] }>({
      moniker: `macro.indicators/${symbol}`,
      shape: "timeseries",
      params: { symbol, range: params?.range ?? "1y" },
    });
    return result.results ?? [];
  },

  // Latest snapshot of all FRED macro indicators, e.g. wbn.snapshot()
  async snapshot(): Promise<SnapshotItem[]> {
    const result = await queryData<{ results: SnapshotItem[] }>({
      moniker: "macro.indicators",
      shape: "snapshot",
    });
    return result.results ?? [];
  },

  // Equity price history, e.g. wbn.equity("AAPL", { range: "3m" })
  async equity(symbol: string, params?: { range?: string }): Promise<SeriesPoint[]> {
    const result = await queryData<{ results: SeriesPoint[] }>({
      moniker: `equity.prices/${symbol}`,
      shape: "timeseries",
      params: { range: params?.range ?? "1y" },
    });
    return result.results ?? [];
  },

  // US Treasury yield curve, e.g. wbn.curve()
  async curve(): Promise<YieldPoint[]> {
    const result = await queryData<{ results: YieldPoint[] }>({
      moniker: "fixed.income.govies",
      shape: "curve",
    });
    return result.results ?? [];
  },

  // Reference rates snapshot (SONIA, SOFR, ESTR, EFFR), e.g. wbn.rates()
  async rates(): Promise<SnapshotItem[]> {
    const result = await queryData<{ results: SnapshotItem[] }>({
      moniker: "reference.rates",
      shape: "snapshot",
    });
    return result.results ?? [];
  },
};
