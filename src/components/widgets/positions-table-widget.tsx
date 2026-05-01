"use client";

import { useEffect, useState, useCallback } from "react";
import type { Position } from "@/lib/portfolio-types";
import { dispatchPositionSelected } from "@/lib/portfolio-types";
import { queryData } from "@/lib/data-query";

type SortKey = keyof Pick<
  Position,
  | "description"
  | "quantity"
  | "cleanPrice"
  | "marketValue"
  | "unrealizedPnl"
  | "duration"
  | "yieldToMaturity"
  | "dayChange"
  | "maturityDate"
>;
type SortDir = "asc" | "desc";

interface PositionsResponse {
  results: Position[];
}

function fmtM(v: number) {
  return `£${(v / 1_000_000).toFixed(1)}m`;
}

function fmtPnl(v: number) {
  const sign = v >= 0 ? "+" : "";
  if (Math.abs(v) >= 1_000_000) return `${sign}£${(v / 1_000_000).toFixed(2)}m`;
  if (Math.abs(v) >= 1_000) return `${sign}£${(v / 1_000).toFixed(0)}k`;
  return `${sign}£${v.toFixed(0)}`;
}

function fmtPrice(v: number) {
  return v.toFixed(2);
}

function pnlClass(v: number) {
  if (v > 0) return "port-pnl--pos";
  if (v < 0) return "port-pnl--neg";
  return "";
}

interface Column {
  key: SortKey;
  label: string;
  align: "left" | "right";
  fmt: (p: Position) => string;
  cls?: (p: Position) => string;
}

const COLUMNS: Column[] = [
  {
    key: "description",
    label: "Instrument",
    align: "left",
    fmt: (p) => p.description,
  },
  {
    key: "quantity",
    label: "Nominal",
    align: "right",
    fmt: (p) => fmtM(p.quantity),
  },
  {
    key: "cleanPrice",
    label: "Clean Px",
    align: "right",
    fmt: (p) => fmtPrice(p.cleanPrice),
  },
  {
    key: "marketValue",
    label: "Mkt Value",
    align: "right",
    fmt: (p) => fmtM(p.marketValue),
  },
  {
    key: "unrealizedPnl",
    label: "Unreal P&L",
    align: "right",
    fmt: (p) => fmtPnl(p.unrealizedPnl),
    cls: (p) => pnlClass(p.unrealizedPnl),
  },
  {
    key: "dayChange",
    label: "Day Chg",
    align: "right",
    fmt: (p) => fmtPnl(p.dayChange),
    cls: (p) => pnlClass(p.dayChange),
  },
  {
    key: "duration",
    label: "Dur",
    align: "right",
    fmt: (p) => p.duration.toFixed(2),
  },
  {
    key: "yieldToMaturity",
    label: "YTM",
    align: "right",
    fmt: (p) => `${p.yieldToMaturity.toFixed(2)}%`,
  },
  {
    key: "maturityDate",
    label: "Maturity",
    align: "right",
    fmt: (p) => p.maturityDate,
  },
];

export function PositionsTableWidget() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("marketValue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await queryData<PositionsResponse>({
          moniker: "portfolio.positions",
        });
        if (!cancelled) setPositions(data.results);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey],
  );

  const handleRowClick = useCallback((id: string) => {
    setSelectedId(id);
    dispatchPositionSelected(id);
  }, []);

  const sorted = [...positions].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp =
      typeof av === "string"
        ? av.localeCompare(bv as string)
        : (av as number) - (bv as number);
    return sortDir === "asc" ? cmp : -cmp;
  });

  if (isLoading) {
    return <div className="positions-table positions-table--state">Loading positions…</div>;
  }

  if (error) {
    return <div className="positions-table positions-table--state">Positions unavailable</div>;
  }

  return (
    <div className="positions-table">
      <div className="positions-table__scroll">
        <table className="positions-table__tbl">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`positions-table__th positions-table__th--${col.align}`}
                  onClick={() => handleSort(col.key)}
                  title={`Sort by ${col.label}`}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="positions-table__sort-arrow" aria-hidden="true">
                      {sortDir === "asc" ? " ▲" : " ▼"}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((pos) => (
              <tr
                key={pos.id}
                className={[
                  "positions-table__row",
                  selectedId === pos.id ? "positions-table__row--selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => handleRowClick(pos.id)}
              >
                {COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    className={[
                      `positions-table__td positions-table__td--${col.align}`,
                      col.cls ? col.cls(pos) : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {col.fmt(pos)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="positions-table__footer">
        {positions.length} positions — click a row to drill down
      </div>
    </div>
  );
}
