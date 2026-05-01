"use client";

import { useEffect, useState, useCallback } from "react";
import type { PositionDetail, PnlPoint } from "@/lib/portfolio-types";
import { POSITION_SELECTED_EVENT } from "@/lib/portfolio-types";
import { apiUrl } from "@/lib/api-base";

function fmtM(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}£${(abs / 1_000_000).toFixed(2)}m`;
  if (abs >= 1_000) return `${sign}£${(abs / 1_000).toFixed(0)}k`;
  return `${sign}£${abs.toFixed(0)}`;
}

function fmtPnl(v: number): string {
  const prefix = v >= 0 ? "+" : "";
  return `${prefix}${fmtM(v)}`;
}

function pnlClass(v: number): string {
  if (v > 0) return "port-pnl--pos";
  if (v < 0) return "port-pnl--neg";
  return "";
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

interface SparklineProps {
  data: PnlPoint[];
}

function Sparkline({ data }: SparklineProps) {
  if (data.length < 2) return null;

  const values = data.map((d) => d.unrealizedPnl);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const W = 400;
  const H = 60;
  const PAD = 4;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;

  const points = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * innerW;
    const y = PAD + (1 - (v - min) / range) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const lastVal = values[values.length - 1] ?? 0;
  const color = lastVal >= 0 ? "#4caf50" : "#f44336";
  const zeroY = PAD + (1 - (0 - min) / range) * innerH;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="position-detail__sparkline"
      aria-label="30-day unrealised P&L"
      role="img"
    >
      {/* Zero line */}
      {min < 0 && max > 0 && (
        <line
          x1={PAD}
          y1={zeroY.toFixed(1)}
          x2={W - PAD}
          y2={zeroY.toFixed(1)}
          stroke="var(--muted)"
          strokeWidth="0.5"
          strokeDasharray="3 3"
        />
      )}
      {/* Area fill */}
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Detail grid ──────────────────────────────────────────────────────────────

interface DetailRowProps {
  label: string;
  value: string;
  className?: string;
}

function DetailRow({ label, value, className }: DetailRowProps) {
  return (
    <div className="position-detail__row">
      <span className="position-detail__row-label">{label}</span>
      <span className={`position-detail__row-value ${className ?? ""}`}>{value}</span>
    </div>
  );
}

// ─── Widget ──────────────────────────────────────────────────────────────────

export function PositionDetailWidget() {
  const [detail, setDetail] = useState<PositionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadPosition = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/portfolio/position/${id}`));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as PositionDetail;
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    function onSelect(e: Event) {
      const id = (e as CustomEvent<{ positionId: string }>).detail.positionId;
      setSelectedId(id);
      void loadPosition(id);
    }

    window.addEventListener(POSITION_SELECTED_EVENT, onSelect);
    return () => window.removeEventListener(POSITION_SELECTED_EVENT, onSelect);
  }, [loadPosition]);

  if (!selectedId) {
    return (
      <div className="position-detail position-detail--empty">
        <span>Select a row in the Positions table to drill down.</span>
      </div>
    );
  }

  if (isLoading) {
    return <div className="position-detail position-detail--state">Loading detail…</div>;
  }

  if (error || !detail) {
    return <div className="position-detail position-detail--state">Detail unavailable</div>;
  }

  const { position: p, pnlHistory } = detail;

  return (
    <div className="position-detail">
      <div className="position-detail__header">
        <div className="position-detail__title">{p.description}</div>
        <div className="position-detail__meta">
          {p.isin} · {p.assetClass} · {p.currency}
        </div>
      </div>

      <div className="position-detail__body">
        <div className="position-detail__cols">
          <div className="position-detail__col">
            <DetailRow label="Nominal" value={`£${(p.quantity / 1_000_000).toFixed(0)}m`} />
            <DetailRow label="Clean Price" value={p.cleanPrice.toFixed(2)} />
            <DetailRow label="Dirty Price" value={p.dirtyPrice.toFixed(2)} />
            <DetailRow label="Cost Price" value={p.costPrice.toFixed(2)} />
            <DetailRow label="Book Value" value={fmtM(p.bookValue)} />
            <DetailRow label="Market Value" value={fmtM(p.marketValue)} />
          </div>
          <div className="position-detail__col">
            <DetailRow
              label="Unrealised P&L"
              value={fmtPnl(p.unrealizedPnl)}
              className={pnlClass(p.unrealizedPnl)}
            />
            <DetailRow
              label="Realised P&L"
              value={fmtPnl(p.realizedPnl)}
              className={pnlClass(p.realizedPnl)}
            />
            <DetailRow
              label="Day Change"
              value={fmtPnl(p.dayChange)}
              className={pnlClass(p.dayChange)}
            />
            <DetailRow label="YTM" value={`${p.yieldToMaturity.toFixed(2)}%`} />
            <DetailRow label="Duration" value={`${p.duration.toFixed(2)}y`} />
            <DetailRow label="Maturity" value={p.maturityDate} />
          </div>
        </div>

        <div className="position-detail__chart-section">
          <div className="position-detail__chart-label">30-day unrealised P&L</div>
          <Sparkline data={pnlHistory} />
        </div>
      </div>
    </div>
  );
}
