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

const RATE_OPTIONS = [
  { id: "SONIA", label: "SONIA", moniker: "reference.rates/SONIA" },
  { id: "SOFR", label: "SOFR", moniker: "reference.rates/SOFR" },
  { id: "ESTR", label: "ESTR", moniker: "reference.rates/ESTR" },
  { id: "EFFR", label: "EFFR", moniker: "reference.rates/EFFR" },
] as const;

const DEFAULT_RATE_MONIKER = RATE_OPTIONS[0].moniker;

function referenceRateMoniker(moniker: string | undefined) {
  const normalized = moniker?.trim();
  return RATE_OPTIONS.some((item) => item.moniker === normalized)
    ? normalized
    : DEFAULT_RATE_MONIKER;
}

async function queryReferenceRate(moniker: string): Promise<RateSeries> {
  const body = await queryData<RatesResponse>({
    moniker,
    shape: "snapshot",
  });
  const fallbackId = moniker.split("/").pop()?.toUpperCase() ?? moniker;
  return (
    body.results?.[0] ?? {
      id: fallbackId,
      label: fallbackId,
      value: null,
      date: null,
      error: body.error ?? "data unavailable",
    }
  );
}

export function ReferenceRatesWidget({
  moniker = "reference.rates",
  onMonikerChange,
}: {
  moniker?: string;
  onMonikerChange?: (moniker: string) => void;
}) {
  const [series, setSeries] = useState<RateSeries[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const selectedMoniker = referenceRateMoniker(moniker);

  useEffect(() => {
    let cancelled = false;

    async function loadRates() {
      setIsLoading(true);
      setError(null);
      try {
        const results = await Promise.all(
          RATE_OPTIONS.map((item) =>
            queryReferenceRate(item.moniker).catch((err) => ({
              id: item.id,
              label: item.label,
              value: null,
              date: null,
              error: err instanceof Error ? err.message : String(err),
            })),
          ),
        );
        if (!cancelled) setSeries(results);
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
  }, []);

  function selectMoniker(nextMoniker: string) {
    if (nextMoniker !== moniker) onMonikerChange?.(nextMoniker);
  }

  if (isLoading) {
    return (
      <div className="reference-rates reference-rates--state">
        Loading reference rates
      </div>
    );
  }

  if (error) {
    return (
      <div className="reference-rates reference-rates--state">
        Reference rates unavailable
      </div>
    );
  }

  return (
    <div className="reference-rates" aria-label="Reference rates">
      <div className="reference-rates__toolbar">
        <label className="reference-rates__selector">
          <span>Reference rate</span>
          <select
            aria-label="Reference rate"
            onChange={(event) => selectMoniker(event.target.value)}
            value={selectedMoniker}
          >
            {RATE_OPTIONS.map((item) => (
              <option key={item.id} value={item.moniker}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <span className="reference-rates__moniker">{selectedMoniker}</span>
      </div>
      <div className="macro-strip reference-rates__grid">
        {series.map((item) => {
          const itemMoniker = `reference.rates/${item.id}`;
          return (
            <button
              className="macro-strip__card reference-rates__card"
              data-active={itemMoniker === selectedMoniker}
              key={item.id}
              onClick={() => selectMoniker(itemMoniker)}
              type="button"
            >
              <div className="macro-strip__label">{item.label}</div>
              <div className="macro-strip__value">
                {item.value === null || Number.isNaN(item.value)
                  ? "-"
                  : `${item.value.toFixed(2)}%`}
              </div>
              <div className="macro-strip__meta">
                <span>{item.id}</span>
                <span>{item.error ? "unavailable" : (item.date ?? "-")}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
