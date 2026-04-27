"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-base";

interface MacroSeries {
  id: string;
  label: string;
  value: number | null;
  date: string | null;
}

interface MacroResponse {
  results?: MacroSeries[];
  error?: string;
}

function formatMacroValue(series: MacroSeries): string {
  if (series.value === null || Number.isNaN(series.value)) return "-";
  if (series.id === "CPIAUCSL") {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(series.value);
  }
  return `${series.value.toFixed(2)}%`;
}

export function MacroWatchlistWidget() {
  const [series, setSeries] = useState<MacroSeries[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadMacroData() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(apiUrl("/api/market/macro"));
        const body = (await response.json()) as MacroResponse;
        if (!response.ok)
          throw new Error(body.error ?? `HTTP ${response.status}`);
        if (!cancelled) setSeries(body.results ?? []);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadMacroData();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="macro-watchlist macro-watchlist--state">
        Loading key rates
      </div>
    );
  }

  if (error) {
    return (
      <div className="macro-watchlist macro-watchlist--state">
        Key rates unavailable
      </div>
    );
  }

  return (
    <div className="macro-watchlist">
      <table className="macro-watchlist__table">
        <thead>
          <tr>
            <th scope="col">Symbol</th>
            <th scope="col">Rate/Value</th>
            <th scope="col">As of Date</th>
          </tr>
        </thead>
        <tbody>
          {series.map((item) => (
            <tr key={item.id}>
              <td>
                <span className="macro-watchlist__symbol">{item.id}</span>
                <span className="macro-watchlist__label">{item.label}</span>
              </td>
              <td>{formatMacroValue(item)}</td>
              <td>{item.date ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
