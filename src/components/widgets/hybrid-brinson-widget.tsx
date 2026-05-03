"use client";

import { useState } from "react";
import {
  type BrinsonResponse,
  FIXED_INCOME_BENCHMARK_MONIKERS,
  FIXED_INCOME_PORTFOLIO_MONIKERS,
  runBrinson,
} from "@/lib/analytics-client";

const EFFECT_ROWS: Array<{ key: keyof BrinsonResponse["effects"]; label: string }> = [
  { key: "yield_income", label: "Yield / income" },
  { key: "rates_parallel", label: "Rates — parallel" },
  { key: "rates_curve", label: "Rates — curve" },
  { key: "spread_allocation", label: "Spread allocation" },
  { key: "selection", label: "Selection" },
  { key: "residual", label: "Residual" },
];

function fmtBps(v: number): string {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)} bps`;
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtWeight(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function sentimentClass(v: number): string {
  if (v > 0) return "brinson-widget__cell--pos";
  if (v < 0) return "brinson-widget__cell--neg";
  return "";
}

export function HybridBrinsonWidget({
  moniker,
}: {
  moniker?: string;
}) {
  const [portfolio, setPortfolio] = useState<string>(moniker ?? FIXED_INCOME_PORTFOLIO_MONIKERS[0]);
  const [benchmark, setBenchmark] = useState<string>(FIXED_INCOME_BENCHMARK_MONIKERS[0]);
  const [asofDate, setAsofDate] = useState<string>("2026-04-30");
  const [backend, setBackend] = useState<string>("numpy");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BrinsonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await runBrinson({
        portfolio_moniker: portfolio,
        benchmark_moniker: benchmark,
        asof_date: asofDate,
        backend,
      });
      setResult(resp);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="brinson-widget">
      <div className="brinson-widget__controls">
        <label className="brinson-widget__field">
          <span>Portfolio</span>
          <input
            list="brinson-portfolio-monikers"
            value={portfolio}
            onChange={(e) => setPortfolio(e.target.value)}
          />
        </label>
        <label className="brinson-widget__field">
          <span>Benchmark</span>
          <input
            list="brinson-benchmark-monikers"
            value={benchmark}
            onChange={(e) => setBenchmark(e.target.value)}
          />
        </label>
        <label className="brinson-widget__field brinson-widget__field--date">
          <span>As-of</span>
          <input type="date" value={asofDate} onChange={(e) => setAsofDate(e.target.value)} />
        </label>
        <label className="brinson-widget__field brinson-widget__field--backend">
          <span>Backend</span>
          <select value={backend} onChange={(e) => setBackend(e.target.value)}>
            <option value="numpy">numpy</option>
            <option value="torch_cuda">torch_cuda</option>
          </select>
        </label>
        <button
          className="brinson-widget__run"
          onClick={handleRun}
          disabled={loading}
          type="button"
        >
          {loading ? "Running…" : "Run"}
        </button>
        <datalist id="brinson-portfolio-monikers">
          {FIXED_INCOME_PORTFOLIO_MONIKERS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <datalist id="brinson-benchmark-monikers">
          {FIXED_INCOME_BENCHMARK_MONIKERS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </div>

      {error ? <div className="brinson-widget__error">{error}</div> : null}

      {result ? (
        <>
          <div className="brinson-widget__header">
            <div className="brinson-widget__stat">
              <span className="brinson-widget__stat-label">Total active</span>
              <span
                className={`brinson-widget__stat-value ${sentimentClass(result.total_active_return_bps)}`}
              >
                {fmtBps(result.total_active_return_bps)}
              </span>
            </div>
            <div className="brinson-widget__stat">
              <span className="brinson-widget__stat-label">Backend</span>
              <span className="brinson-widget__stat-value">{result.backend}</span>
            </div>
            <div className="brinson-widget__stat">
              <span className="brinson-widget__stat-label">Engine</span>
              <span className="brinson-widget__stat-value">v{result.engine_version}</span>
            </div>
            {result.fixture_mode ? (
              <div className="brinson-widget__stat">
                <span className="brinson-widget__stat-label">Mode</span>
                <span className="brinson-widget__stat-value brinson-widget__stat-value--accent">fixture</span>
              </div>
            ) : null}
          </div>

          <div className="brinson-widget__section">
            <div className="brinson-widget__section-title">Top-level effects</div>
            <table className="brinson-widget__table">
              <thead>
                <tr>
                  <th>Effect</th>
                  <th className="brinson-widget__num">Value</th>
                  <th className="brinson-widget__num">Contribution</th>
                </tr>
              </thead>
              <tbody>
                {EFFECT_ROWS.map(({ key, label }) => {
                  const eff = result.effects[key];
                  return (
                    <tr key={key}>
                      <td>{label}</td>
                      <td className={`brinson-widget__num ${sentimentClass(eff.value_bps)}`}>
                        {fmtBps(eff.value_bps)}
                      </td>
                      <td className="brinson-widget__num brinson-widget__cell--muted">
                        {fmtPct(eff.contribution)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="brinson-widget__section">
            <div className="brinson-widget__section-title">By sector</div>
            <table className="brinson-widget__table">
              <thead>
                <tr>
                  <th>Sector</th>
                  <th className="brinson-widget__num">W. port</th>
                  <th className="brinson-widget__num">W. bench</th>
                  <th className="brinson-widget__num">Allocation</th>
                  <th className="brinson-widget__num">Selection</th>
                </tr>
              </thead>
              <tbody>
                {result.by_sector.map((row) => (
                  <tr key={row.sector}>
                    <td>{row.sector}</td>
                    <td className="brinson-widget__num">{fmtWeight(row.weight_port)}</td>
                    <td className="brinson-widget__num">{fmtWeight(row.weight_bench)}</td>
                    <td className={`brinson-widget__num ${sentimentClass(row.allocation_bps)}`}>
                      {fmtBps(row.allocation_bps)}
                    </td>
                    <td className={`brinson-widget__num ${sentimentClass(row.selection_bps)}`}>
                      {fmtBps(row.selection_bps)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : !loading && !error ? (
        <div className="brinson-widget__empty">Pick monikers and click Run.</div>
      ) : null}
    </div>
  );
}
