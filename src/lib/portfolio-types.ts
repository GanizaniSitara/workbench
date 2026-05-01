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

export interface PortfolioSummary {
  totalMarketValue: number;
  totalBookValue: number;
  totalUnrealizedPnl: number;
  unrealizedPnlPct: number;
  totalRealizedPnl: number;
  totalPnl: number;
  totalPnlPct: number;
  totalDayChange: number;
  dayChangePct: number;
  weightedDuration: number;
  positionCount: number;
}

export interface ExposureEntry {
  label: string;
  value: number;
  pct: number;
}

export interface PortfolioExposure {
  total: number;
  byAssetClass: ExposureEntry[];
  bySector: ExposureEntry[];
}

export interface PnlPoint {
  date: string;
  unrealizedPnl: number;
}

export interface PositionDetail {
  position: Position;
  pnlHistory: PnlPoint[];
}

export const POSITION_SELECTED_EVENT = "workbench:position-select";

export function dispatchPositionSelected(positionId: string) {
  window.dispatchEvent(
    new CustomEvent(POSITION_SELECTED_EVENT, { detail: { positionId } }),
  );
}
