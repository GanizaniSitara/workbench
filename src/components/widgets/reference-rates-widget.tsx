"use client";

import { useEffect, useState } from "react";
import { queryData } from "@/lib/data-query";

interface RateSeries {
  id: string;
  label: string;
  value: number | null;
  date: string | null;
  source?: string;
  error?: string;
}

interface RatesResponse {
  shape?: "snapshot";
  results?: RateSeries[];
  error?: string;
}

export function ReferenceRatesWidget({
  moniker = "reference.rates",
}: {
  moniker?: string;
}) {
  const [series, setSeries] = useState<RateSeries[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadRates() {
      setIsLoading(true);
      setError(null);
      try {
        const body = await queryData<RatesResponse>({
          moniker,
          shape: "snapshot",
        });
        if (!cancelled) setSeries(body.results ?? []);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadRates();
    return () => {
      cancelled = true;
    };
  }, [moniker]);

  if (isLoading) {
    return (
      <div className="macro-strip macro-strip--state">
        Loading reference rates
      </div>
    );
  }

  if (error) {
    return (
      <div className="macro-strip macro-strip--state">
        Reference rates unavailable
      </div>
    );
  }

  return (
    <div className="macro-strip" aria-label="Reference rates">
      {series.map((item) => (
        <article className="macro-strip__card" key={item.id}>
          <div className="macro-strip__label">{item.label}</div>
          <div className="macro-strip__value">
            {item.value === null || Number.isNaN(item.value)
              ? "-"
              : `${item.value.toFixed(2)}%`}
          </div>
          <div className="macro-strip__meta">
            <span>{item.id}</span>
            <span>{item.date ?? "-"}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
