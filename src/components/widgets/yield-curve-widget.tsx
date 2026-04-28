"use client";

import { useEffect, useMemo, useState } from "react";
import { queryData } from "@/lib/data-query";

interface YieldPoint {
  maturity: string;
  rate: number;
}

interface YieldResponse {
  shape?: "curve";
  results?: YieldPoint[];
  error?: string;
}

const MATURITY_LABELS: Record<string, string> = {
  month1: "1M",
  month3: "3M",
  month6: "6M",
  year1: "1Y",
  year2: "2Y",
  year5: "5Y",
  year10: "10Y",
  year20: "20Y",
  year30: "30Y",
};

const CHART = {
  width: 500,
  height: 280,
  padLeft: 40,
  padRight: 16,
  padTop: 16,
  padBottom: 28,
};

function buildPath(points: Array<{ x: number; y: number }>): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function buildAreaPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  const baseline = CHART.height - CHART.padBottom;
  return `${buildPath(points)} L ${points[points.length - 1].x} ${baseline} L ${
    points[0].x
  } ${baseline} Z`;
}

function formatTick(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function YieldCurveWidget({
  moniker = "fixed.income.govies",
}: {
  moniker?: string;
}) {
  const [curve, setCurve] = useState<YieldPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadYieldCurve() {
      setIsLoading(true);
      setError(null);
      try {
        const body = await queryData<YieldResponse>({
          moniker: `${moniker}/date@latest`,
          shape: "curve",
        });
        if (!cancelled) {
          setCurve(body.results ?? []);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadYieldCurve();
    return () => {
      cancelled = true;
    };
  }, [moniker]);

  const chart = useMemo(() => {
    const values = curve.map((point) => point.rate);
    const minValue = values.length ? Math.min(...values) : 0;
    const maxValue = values.length ? Math.max(...values) : 1;
    const yMin = Math.max(0, Math.floor((minValue - 0.25) * 2) / 2);
    const yMax = Math.ceil((maxValue + 0.25) * 2) / 2;
    const yRange = yMax - yMin || 1;
    const plotWidth = CHART.width - CHART.padLeft - CHART.padRight;
    const plotHeight = CHART.height - CHART.padTop - CHART.padBottom;
    const points = curve.map((point, index) => {
      const denominator = Math.max(curve.length - 1, 1);
      const x = CHART.padLeft + (index / denominator) * plotWidth;
      const y = CHART.padTop + ((yMax - point.rate) / yRange) * plotHeight;
      return { ...point, x, y };
    });
    const ticks = [0, 0.5, 1].map((ratio) => {
      const value = yMax - ratio * yRange;
      return {
        value,
        y: CHART.padTop + ratio * plotHeight,
      };
    });

    return {
      areaPath: buildAreaPath(points),
      linePath: buildPath(points),
      points,
      ticks,
      xAxisY: CHART.height - CHART.padBottom,
    };
  }, [curve]);

  if (isLoading) {
    return (
      <div className="yield-curve yield-curve--state">Loading yield curve</div>
    );
  }

  if (error || curve.length === 0) {
    return (
      <div className="yield-curve yield-curve--state">
        Yield curve unavailable
      </div>
    );
  }

  return (
    <div className="yield-curve" aria-label="US Treasury yield curve">
      <svg
        className="yield-curve__chart"
        preserveAspectRatio="none"
        role="img"
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
      >
        <title>US Treasury yield curve</title>
        {chart.ticks.map((tick) => (
          <g className="yield-curve__tick" key={tick.y}>
            <line
              x1={CHART.padLeft}
              x2={CHART.width - CHART.padRight}
              y1={tick.y}
              y2={tick.y}
            />
            <text x={CHART.padLeft - 8} y={tick.y + 4}>
              {formatTick(tick.value)}
            </text>
          </g>
        ))}
        <line
          className="yield-curve__axis"
          x1={CHART.padLeft}
          x2={CHART.width - CHART.padRight}
          y1={chart.xAxisY}
          y2={chart.xAxisY}
        />
        <path className="yield-curve__area" d={chart.areaPath} />
        <path className="yield-curve__line" d={chart.linePath} />
        {chart.points.map((point) => (
          <g className="yield-curve__point" key={point.maturity}>
            <circle cx={point.x} cy={point.y} r="3" />
            <text x={point.x} y={CHART.height - 8}>
              {MATURITY_LABELS[point.maturity] ?? point.maturity}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
