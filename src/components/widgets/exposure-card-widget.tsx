"use client";

import { useEffect, useState } from "react";
import type { PortfolioExposure, ExposureEntry } from "@/lib/portfolio-types";
import { queryData } from "@/lib/data-query";

interface SnapshotResponse<T> {
  results: T;
}

function fmtM(v: number): string {
  if (v >= 1_000_000_000) return `£${(v / 1_000_000_000).toFixed(1)}bn`;
  return `£${(v / 1_000_000).toFixed(1)}m`;
}

const ASSET_CLASS_COLORS: Record<string, string> = {
  Gilt: "var(--accent)",
  "IL Gilt": "#6c8ebf",
  Corp: "#e07b39",
  "T-Bill": "#5a9e6f",
};

const SECTOR_COLORS: Record<string, string> = {
  Government: "var(--accent)",
  Financial: "#e07b39",
  Corporate: "#9b5de5",
};

interface BarSectionProps {
  entries: ExposureEntry[];
  colors: Record<string, string>;
}

function BarSection({ entries, colors }: BarSectionProps) {
  return (
    <ul className="exposure-card__bars" role="list">
      {entries.map((entry) => (
        <li key={entry.label} className="exposure-card__bar-item">
          <div className="exposure-card__bar-header">
            <span className="exposure-card__bar-label">{entry.label}</span>
            <span className="exposure-card__bar-value">
              {fmtM(entry.value)}{" "}
              <span className="exposure-card__bar-pct">
                {(entry.pct * 100).toFixed(1)}%
              </span>
            </span>
          </div>
          <div className="exposure-card__bar-track">
            <div
              className="exposure-card__bar-fill"
              style={{
                width: `${(entry.pct * 100).toFixed(1)}%`,
                background: colors[entry.label] ?? "var(--muted)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ExposureCardWidget() {
  const [exposure, setExposure] = useState<PortfolioExposure | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await queryData<SnapshotResponse<PortfolioExposure>>({
          moniker: "portfolio.exposure",
        });
        if (!cancelled) setExposure(data.results);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  if (isLoading) {
    return <div className="exposure-card exposure-card--state">Loading exposure…</div>;
  }

  if (error || !exposure) {
    return <div className="exposure-card exposure-card--state">Exposure unavailable</div>;
  }

  return (
    <div className="exposure-card">
      <div className="exposure-card__total">
        Total {fmtM(exposure.total)}
      </div>

      <section className="exposure-card__section">
        <h3 className="exposure-card__section-title">By Asset Class</h3>
        <BarSection entries={exposure.byAssetClass} colors={ASSET_CLASS_COLORS} />
      </section>

      <section className="exposure-card__section">
        <h3 className="exposure-card__section-title">By Sector</h3>
        <BarSection entries={exposure.bySector} colors={SECTOR_COLORS} />
      </section>
    </div>
  );
}
