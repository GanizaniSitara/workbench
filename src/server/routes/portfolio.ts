import { Router } from "express";

export const portfolioRouter = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Position {
  id: string;
  isin: string;
  description: string;
  assetClass: "Gilt" | "IL Gilt" | "Corp" | "T-Bill";
  sector: "Government" | "Financial" | "Corporate";
  quantity: number;
  cleanPrice: number;
  dirtyPrice: number;
  costPrice: number;
  marketValue: number;
  bookValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  yieldToMaturity: number;
  duration: number;
  maturityDate: string;
  currency: "GBP" | "USD" | "EUR";
  dayChange: number;
  dayChangePct: number;
}

// ─── Mock book ────────────────────────────────────────────────────────────────

const POSITIONS: Position[] = [
  {
    id: "pos-001",
    isin: "GB00BM8Z2S06",
    description: "UK Gilt 3.75% 2038",
    assetClass: "Gilt",
    sector: "Government",
    quantity: 10_000_000,
    cleanPrice: 92.45,
    dirtyPrice: 93.28,
    costPrice: 91.20,
    marketValue: 9_328_000,
    bookValue: 9_120_000,
    unrealizedPnl: 208_000,
    realizedPnl: 45_000,
    yieldToMaturity: 4.42,
    duration: 8.71,
    maturityDate: "2038-10-22",
    currency: "GBP",
    dayChange: -18_500,
    dayChangePct: -0.20,
  },
  {
    id: "pos-002",
    isin: "GB0031829509",
    description: "UK Gilt 4.25% 2034",
    assetClass: "Gilt",
    sector: "Government",
    quantity: 15_000_000,
    cleanPrice: 97.84,
    dirtyPrice: 98.67,
    costPrice: 96.10,
    marketValue: 14_800_500,
    bookValue: 14_415_000,
    unrealizedPnl: 385_500,
    realizedPnl: 78_000,
    yieldToMaturity: 4.51,
    duration: 6.42,
    maturityDate: "2034-09-07",
    currency: "GBP",
    dayChange: 12_300,
    dayChangePct: 0.08,
  },
  {
    id: "pos-003",
    isin: "GB00BJQRDQ95",
    description: "UK Gilt 0.5% 2029",
    assetClass: "Gilt",
    sector: "Government",
    quantity: 20_000_000,
    cleanPrice: 84.32,
    dirtyPrice: 84.58,
    costPrice: 98.50,
    marketValue: 16_916_000,
    bookValue: 19_700_000,
    unrealizedPnl: -2_784_000,
    realizedPnl: 0,
    yieldToMaturity: 4.37,
    duration: 3.22,
    maturityDate: "2029-07-22",
    currency: "GBP",
    dayChange: -5_200,
    dayChangePct: -0.03,
  },
  {
    id: "pos-004",
    isin: "GB0009081828",
    description: "UK IL Gilt 0.125% 2031",
    assetClass: "IL Gilt",
    sector: "Government",
    quantity: 5_000_000,
    cleanPrice: 104.12,
    dirtyPrice: 104.35,
    costPrice: 99.85,
    marketValue: 5_217_500,
    bookValue: 4_992_500,
    unrealizedPnl: 225_000,
    realizedPnl: 0,
    yieldToMaturity: 0.32,
    duration: 4.88,
    maturityDate: "2031-11-22",
    currency: "GBP",
    dayChange: 8_700,
    dayChangePct: 0.17,
  },
  {
    id: "pos-005",
    isin: "GB00BN65R313",
    description: "UK T-Bill 0% Sep 2025",
    assetClass: "T-Bill",
    sector: "Government",
    quantity: 25_000_000,
    cleanPrice: 98.82,
    dirtyPrice: 98.82,
    costPrice: 98.45,
    marketValue: 24_705_000,
    bookValue: 24_612_500,
    unrealizedPnl: 92_500,
    realizedPnl: 0,
    yieldToMaturity: 4.68,
    duration: 0.37,
    maturityDate: "2025-09-15",
    currency: "GBP",
    dayChange: 2_100,
    dayChangePct: 0.01,
  },
  {
    id: "pos-006",
    isin: "XS2350412955",
    description: "Barclays 5.2% 2027",
    assetClass: "Corp",
    sector: "Financial",
    quantity: 8_000_000,
    cleanPrice: 99.15,
    dirtyPrice: 100.22,
    costPrice: 100.00,
    marketValue: 8_017_600,
    bookValue: 8_000_000,
    unrealizedPnl: 17_600,
    realizedPnl: 0,
    yieldToMaturity: 5.38,
    duration: 1.92,
    maturityDate: "2027-03-15",
    currency: "GBP",
    dayChange: -3_400,
    dayChangePct: -0.04,
  },
  {
    id: "pos-007",
    isin: "XS1829636964",
    description: "HSBC Holdings 4.3% 2028",
    assetClass: "Corp",
    sector: "Financial",
    quantity: 7_500_000,
    cleanPrice: 96.72,
    dirtyPrice: 97.18,
    costPrice: 98.10,
    marketValue: 7_288_500,
    bookValue: 7_357_500,
    unrealizedPnl: -69_000,
    realizedPnl: 22_500,
    yieldToMaturity: 4.98,
    duration: 2.87,
    maturityDate: "2028-06-08",
    currency: "GBP",
    dayChange: -6_800,
    dayChangePct: -0.09,
  },
  {
    id: "pos-008",
    isin: "XS2107086310",
    description: "Shell 4.0% 2030",
    assetClass: "Corp",
    sector: "Corporate",
    quantity: 5_000_000,
    cleanPrice: 94.28,
    dirtyPrice: 94.88,
    costPrice: 95.50,
    marketValue: 4_744_000,
    bookValue: 4_775_000,
    unrealizedPnl: -31_000,
    realizedPnl: 15_000,
    yieldToMaturity: 4.73,
    duration: 4.31,
    maturityDate: "2030-05-12",
    currency: "GBP",
    dayChange: 1_400,
    dayChangePct: 0.03,
  },
];

// ─── Routes ──────────────────────────────────────────────────────────────────

portfolioRouter.get("/positions", (_req, res) => {
  res.json({ positions: POSITIONS });
});

portfolioRouter.get("/position/:id", (req, res) => {
  const position = POSITIONS.find((p) => p.id === req.params.id);
  if (!position) return res.status(404).json({ error: "Position not found" });

  // Deterministic mock P&L history (30 trading days)
  const seed = position.unrealizedPnl;
  const pnlHistory = Array.from({ length: 30 }, (_, i) => {
    const date = new Date("2026-05-01");
    date.setDate(date.getDate() - (29 - i));
    const progress = i / 29;
    const wave = Math.sin(i * 0.7) * Math.abs(seed) * 0.08;
    const trend = seed * progress;
    return {
      date: date.toISOString().split("T")[0],
      unrealizedPnl: Math.round(trend + wave),
    };
  });

  return res.json({ position, pnlHistory });
});

portfolioRouter.get("/summary", (_req, res) => {
  const totalMarketValue = POSITIONS.reduce((s, p) => s + p.marketValue, 0);
  const totalBookValue = POSITIONS.reduce((s, p) => s + p.bookValue, 0);
  const totalUnrealizedPnl = POSITIONS.reduce((s, p) => s + p.unrealizedPnl, 0);
  const totalRealizedPnl = POSITIONS.reduce((s, p) => s + p.realizedPnl, 0);
  const totalDayChange = POSITIONS.reduce((s, p) => s + p.dayChange, 0);
  const totalPnl = totalUnrealizedPnl + totalRealizedPnl;
  const weightedDuration =
    POSITIONS.reduce((s, p) => s + p.duration * p.marketValue, 0) /
    totalMarketValue;

  res.json({
    totalMarketValue,
    totalBookValue,
    totalUnrealizedPnl,
    unrealizedPnlPct: totalUnrealizedPnl / totalBookValue,
    totalRealizedPnl,
    totalPnl,
    totalPnlPct: totalPnl / totalBookValue,
    totalDayChange,
    dayChangePct: totalDayChange / totalMarketValue,
    weightedDuration,
    positionCount: POSITIONS.length,
  });
});

portfolioRouter.get("/exposure", (_req, res) => {
  const total = POSITIONS.reduce((s, p) => s + p.marketValue, 0);

  const byAssetClass = new Map<string, number>();
  const bySector = new Map<string, number>();

  for (const p of POSITIONS) {
    byAssetClass.set(p.assetClass, (byAssetClass.get(p.assetClass) ?? 0) + p.marketValue);
    bySector.set(p.sector, (bySector.get(p.sector) ?? 0) + p.marketValue);
  }

  const toEntries = (m: Map<string, number>) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value, pct: value / total }));

  res.json({
    total,
    byAssetClass: toEntries(byAssetClass),
    bySector: toEntries(bySector),
  });
});
