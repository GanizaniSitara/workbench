"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-base";

interface MacroSeries {
  id: string;
  label: string;
  value: number | null;
  date: string | null;
  source?: string;
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

export function MacroStripWidget({
  moniker = "macro.indicators",
}: {
  moniker?: string;
}) {
  const [series, setSeries] = useState<MacroSeries[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadMacroData() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(
          apiUrl(`/api/market/macro?moniker=${encodeURIComponent(moniker)}`),
        );
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
  }, [moniker]);

  if (isLoading) {
    return (
      <div className="macro-strip macro-strip--state">Loading macro data</div>
    );
  }

  if (error) {
    return (
      <div className="macro-strip macro-strip--state">
        Macro data unavailable
      </div>
    );
  }

  return (
    <div className="macro-strip" aria-label="Macro indicators">
      {series.map((item) => (
        <article className="macro-strip__card" key={item.id}>
          <div className="macro-strip__label">{item.label}</div>
          <div className="macro-strip__value">{formatMacroValue(item)}</div>
          <div className="macro-strip__meta">
            <span>{item.id}</span>
            <span>{item.date ?? "-"}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
