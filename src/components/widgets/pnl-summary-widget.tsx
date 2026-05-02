"use client";

import { useEffect, useState } from "react";
import type { PortfolioSummary } from "@/lib/portfolio-types";
import { queryData } from "@/lib/data-query";

interface SnapshotResponse<T> {
  results: T;
}

function fmtCcy(v: number, forceSign = false): string {
  const sign = forceSign && v >= 0 ? "+" : "";
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${sign}${v < 0 ? "-" : ""}£${(abs / 1_000_000_000).toFixed(2)}bn`;
  if (abs >= 1_000_000) return `${sign}${v < 0 ? "-" : ""}£${(abs / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${sign}${v < 0 ? "-" : ""}£${(abs / 1_000).toFixed(0)}k`;
  return `${sign}${v < 0 ? "-" : ""}£${abs.toFixed(0)}`;
}

function fmtPct(v: number, forceSign = false): string {
  const sign = forceSign && v >= 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(2)}%`;
}

function sign(v: number): "pos" | "neg" | "flat" {
  if (v > 0) return "pos";
  if (v < 0) return "neg";
  return "flat";
}

interface Tile {
  label: string;
  primary: string;
  secondary?: string;
  sentiment?: "pos" | "neg" | "flat" | "neutral";
}

function buildTiles(s: PortfolioSummary): Tile[] {
  return [
    {
      label: "Market Value",
      primary: fmtCcy(s.totalMarketValue),
      secondary: `${s.positionCount} positions`,
      sentiment: "neutral",
    },
    {
      label: "Unrealised P&L",
      primary: fmtCcy(s.totalUnrealizedPnl, true),
      secondary: fmtPct(s.unrealizedPnlPct, true),
      sentiment: sign(s.totalUnrealizedPnl),
    },
    {
      label: "Realised P&L",
      primary: fmtCcy(s.totalRealizedPnl, true),
      sentiment: sign(s.totalRealizedPnl),
    },
    {
      label: "Total P&L",
      primary: fmtCcy(s.totalPnl, true),
      secondary: fmtPct(s.totalPnlPct, true),
      sentiment: sign(s.totalPnl),
    },
    {
      label: "Day Change",
      primary: fmtCcy(s.totalDayChange, true),
      secondary: fmtPct(s.dayChangePct, true),
      sentiment: sign(s.totalDayChange),
    },
    {
      label: "Portfolio Duration",
      primary: `${s.weightedDuration.toFixed(2)}y`,
      secondary: "weighted avg",
      sentiment: "neutral",
    },
  ];
}

export function PnlSummaryWidget({
  moniker = "portfolio.summary",
}: {
  moniker?: string;
}) {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await queryData<SnapshotResponse<PortfolioSummary>>({
          moniker,
        });
        if (!cancelled) setSummary(data.results);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [moniker]);

  if (isLoading) {
    return <div className="pnl-summary pnl-summary--state">Loading summary…</div>;
  }

  if (error || !summary) {
    return <div className="pnl-summary pnl-summary--state">Summary unavailable</div>;
  }

  const tiles = buildTiles(summary);

  return (
    <div className="pnl-summary">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className={`pnl-summary__tile pnl-summary__tile--${tile.sentiment ?? "neutral"}`}
        >
          <div className="pnl-summary__label">{tile.label}</div>
          <div className="pnl-summary__primary">{tile.primary}</div>
          {tile.secondary && (
            <div className="pnl-summary__secondary">{tile.secondary}</div>
          )}
        </div>
      ))}
    </div>
  );
}
