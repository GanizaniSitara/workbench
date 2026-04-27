import type { RouteStep } from "../route-plan";

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface LatestSeriesPoint {
  date: string;
  value: number;
}

export interface YieldPoint {
  maturity: string;
  rate: number;
}

const YIELD_MAP: Record<string, string> = {
  DGS1MO: "month1",
  DGS3MO: "month3",
  DGS6MO: "month6",
  DGS1: "year1",
  DGS2: "year2",
  DGS5: "year5",
  DGS10: "year10",
  DGS20: "year20",
  DGS30: "year30",
};

const MATURITY_ORDER = Object.values(YIELD_MAP);
const SYMBOL_LIST = Object.keys(YIELD_MAP)
  .map((symbol) => `'${symbol}'`)
  .join(",");

async function queryQuestDb<T>(
  questdbUrl: string,
  sql: string,
): Promise<T[] | null> {
  try {
    const response = await fetch(
      `${questdbUrl}/exec?query=${encodeURIComponent(sql)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) return null;
    const body = await response.json();
    return Array.isArray(body?.dataset) ? body.dataset : null;
  } catch {
    return null;
  }
}

function normalizeSeriesRows(rows: Array<[string, number]>): SeriesPoint[] {
  return rows
    .map(([date, value]) => ({
      date: String(date).split("T")[0],
      value: Number(value),
    }))
    .filter((point) => point.date && Number.isFinite(point.value));
}

function normalizeYieldCurveRows(rows: Array<[string, number]>): YieldPoint[] {
  return rows
    .map(([symbol, value]) => ({
      maturity: YIELD_MAP[symbol],
      rate: Number(value),
    }))
    .filter((point) => Boolean(point.maturity) && Number.isFinite(point.rate))
    .sort(
      (a, b) =>
        MATURITY_ORDER.indexOf(a.maturity) - MATURITY_ORDER.indexOf(b.maturity),
    );
}

export async function fetchLatestSeriesFromQuestDb(
  questdbUrl: string,
  route: RouteStep,
): Promise<LatestSeriesPoint | null> {
  const symbol = String(route.ref.symbol);
  const table = String(route.ref.table);
  const sql = `SELECT ts, value FROM ${table} WHERE symbol='${symbol}' ORDER BY ts DESC LIMIT 1`;
  const rows = await queryQuestDb<[string, number]>(questdbUrl, sql);
  const point = rows?.[0];
  if (!point) return null;

  const [normalized] = normalizeSeriesRows([point]);
  return normalized ?? null;
}

export async function fetchSeriesFromQuestDb(
  questdbUrl: string,
  route: RouteStep,
  limit: number,
): Promise<SeriesPoint[] | null> {
  const symbol = String(route.ref.symbol);
  const table = String(route.ref.table);
  const sql = `SELECT ts, value FROM ${table} WHERE symbol='${symbol}' ORDER BY ts DESC LIMIT ${limit}`;
  const rows = await queryQuestDb<[string, number]>(questdbUrl, sql);
  if (!rows?.length) return null;

  return normalizeSeriesRows(rows).reverse();
}

export async function fetchYieldCurveFromQuestDb(
  questdbUrl: string,
  route: RouteStep,
): Promise<YieldPoint[] | null> {
  const table = String(route.ref.table);
  const sql = `SELECT symbol, value FROM ${table} WHERE symbol IN (${SYMBOL_LIST}) LATEST ON ts PARTITION BY symbol`;
  const rows = await queryQuestDb<[string, number]>(questdbUrl, sql);
  if (!rows || rows.length < Object.keys(YIELD_MAP).length) return null;

  const curve = normalizeYieldCurveRows(rows);
  return curve.length ? curve : null;
}
