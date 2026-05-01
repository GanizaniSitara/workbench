import type { LayoutItem, WidgetType } from "@/lib/layout";

export type WidgetCategory = "Markets" | "Research" | "AI" | "Workbench" | "Portfolio";
export type WidgetDataKind = "macro" | "rates" | "equity" | "news" | "chat" | "portfolio";

export interface WidgetRegistryEntry {
  type: WidgetType;
  title: string;
  description: string;
  category: WidgetCategory;
  idPrefix: string;
  singleton?: boolean;
  supportedDataKinds?: WidgetDataKind[];
  defaultLayout: Pick<LayoutItem, "w" | "h" | "minW" | "minH">;
}

export const WIDGET_REGISTRY: WidgetRegistryEntry[] = [
  {
    type: "macro-strip",
    title: "Macro",
    description: "Compact top-line FRED macro indicators.",
    category: "Markets",
    idPrefix: "macro",
    singleton: true,
    supportedDataKinds: ["macro", "rates"],
    defaultLayout: { w: 12, h: 3, minW: 6, minH: 2 },
  },
  {
    type: "macro-timeseries",
    title: "Rates Chart",
    description: "Lightweight Charts time-series view with range controls.",
    category: "Markets",
    idPrefix: "macro-timeseries",
    supportedDataKinds: ["macro", "rates"],
    defaultLayout: { w: 8, h: 10, minW: 4, minH: 4 },
  },
  {
    type: "macro-watchlist",
    title: "Key Rates",
    description: "Scrollable table of key FRED rates and values.",
    category: "Markets",
    idPrefix: "macro-watchlist",
    singleton: true,
    supportedDataKinds: ["macro", "rates"],
    defaultLayout: { w: 4, h: 10, minW: 2, minH: 4 },
  },
  {
    type: "placeholder-chat",
    title: "AI Chat",
    description: "Ollama-backed assistant panel.",
    category: "AI",
    idPrefix: "chat",
    supportedDataKinds: ["chat", "macro", "rates", "equity", "news"],
    defaultLayout: { w: 6, h: 7, minW: 3, minH: 3 },
  },
  {
    type: "placeholder-news",
    title: "News",
    description: "OpenBB/YFinance market headlines feed.",
    category: "Research",
    idPrefix: "news",
    supportedDataKinds: ["news", "equity"],
    defaultLayout: { w: 6, h: 7, minW: 2, minH: 3 },
  },
  {
    type: "yield-curve",
    title: "Yield Curve",
    description:
      "Static Treasury curve view retained for fixed-income workflows.",
    category: "Markets",
    idPrefix: "yield-curve",
    supportedDataKinds: ["rates"],
    defaultLayout: { w: 6, h: 7, minW: 4, minH: 4 },
  },
  {
    type: "reference-rates",
    title: "Reference Rates",
    description: "Live strip of SONIA, SOFR, ESTR, and EFFR reference rates.",
    category: "Markets",
    idPrefix: "ref-rates",
    singleton: true,
    supportedDataKinds: ["rates"],
    defaultLayout: { w: 12, h: 3, minW: 6, minH: 2 },
  },
  {
    type: "equity-chart",
    title: "Equity Chart",
    description: "Price history chart for any equity ticker via yfinance.",
    category: "Markets",
    idPrefix: "equity",
    supportedDataKinds: ["equity"],
    defaultLayout: { w: 8, h: 10, minW: 4, minH: 4 },
  },
  {
    type: "overlay-chart",
    title: "Overlay Chart",
    description: "Compare any tickers or macro series as % change on one chart.",
    category: "Markets",
    idPrefix: "overlay",
    supportedDataKinds: ["equity", "macro", "rates"],
    defaultLayout: { w: 8, h: 10, minW: 4, minH: 4 },
  },
  {
    type: "catalog",
    title: "Business Catalog",
    description: "Card catalog for datasets, files, APIs, and applications.",
    category: "Workbench",
    idPrefix: "catalog",
    singleton: true,
    supportedDataKinds: ["macro", "rates", "equity", "portfolio", "news"],
    defaultLayout: { w: 12, h: 20, minW: 8, minH: 12 },
  },
  {
    type: "placeholder-chart",
    title: "Chart",
    description: "Placeholder price chart slot for WBN-005.",
    category: "Workbench",
    idPrefix: "chart",
    supportedDataKinds: ["equity"],
    defaultLayout: { w: 8, h: 8, minW: 3, minH: 4 },
  },
  {
    type: "placeholder-watchlist",
    title: "Watchlist",
    description: "Placeholder market watchlist slot for later workflows.",
    category: "Workbench",
    idPrefix: "watchlist",
    supportedDataKinds: ["equity", "rates"],
    defaultLayout: { w: 4, h: 8, minW: 2, minH: 4 },
  },
  {
    type: "notebook",
    title: "Notebook",
    description:
      "Interactive scratchpad with code cells (wbn.fred, wbn.equity, wbn.curve...) and markdown.",
    category: "Workbench",
    idPrefix: "notebook",
    supportedDataKinds: ["macro", "rates", "equity"],
    defaultLayout: { w: 8, h: 14, minW: 4, minH: 6 },
  },
  {
    type: "news-feed",
    title: "News Feed",
    description: "Symbol-linked news feed with compact cards and auto-refresh.",
    category: "Research",
    idPrefix: "news-feed",
    supportedDataKinds: ["news", "equity"],
    defaultLayout: { w: 6, h: 9, minW: 3, minH: 4 },
  },
  {
    type: "event-context",
    title: "Event Context",
    description: "Per-symbol news activity radar — spot which tickers are in the headlines.",
    category: "Research",
    idPrefix: "event-ctx",
    supportedDataKinds: ["news", "equity"],
    defaultLayout: { w: 5, h: 8, minW: 3, minH: 4 },
  },
  {
    type: "research-panel",
    title: "Research Panel",
    description: "Combined price change and top headlines per tracked symbol.",
    category: "Research",
    idPrefix: "research",
    supportedDataKinds: ["news", "equity"],
    defaultLayout: { w: 6, h: 10, minW: 3, minH: 5 },
  },
  {
    type: "positions-table",
    title: "Positions",
    description: "Sortable live positions table with P&L and risk metrics.",
    category: "Portfolio",
    idPrefix: "positions",
    supportedDataKinds: ["portfolio"],
    defaultLayout: { w: 8, h: 10, minW: 5, minH: 5 },
  },
  {
    type: "pnl-summary",
    title: "P&L Summary",
    description: "Top-line P&L, day change, and portfolio duration tiles.",
    category: "Portfolio",
    idPrefix: "pnl",
    supportedDataKinds: ["portfolio"],
    defaultLayout: { w: 12, h: 4, minW: 6, minH: 3 },
  },
  {
    type: "exposure-card",
    title: "Exposure",
    description: "Exposure breakdown by asset class and sector with bar charts.",
    category: "Portfolio",
    idPrefix: "exposure",
    supportedDataKinds: ["portfolio"],
    defaultLayout: { w: 4, h: 10, minW: 3, minH: 5 },
  },
  {
    type: "position-detail",
    title: "Position Detail",
    description: "Drill-down panel for a selected position with P&L history.",
    category: "Portfolio",
    idPrefix: "detail",
    supportedDataKinds: ["portfolio"],
    defaultLayout: { w: 12, h: 8, minW: 5, minH: 4 },
  },
];

export const WIDGET_CATEGORIES: WidgetCategory[] = [
  "Markets",
  "Research",
  "AI",
  "Workbench",
  "Portfolio",
];

export function getWidgetRegistryEntry(type: WidgetType): WidgetRegistryEntry {
  const entry = WIDGET_REGISTRY.find((item) => item.type === type);
  if (!entry) throw new Error(`Unknown widget type: ${type}`);
  return entry;
}

export function widgetSupportsMoniker(type: WidgetType): boolean {
  const entry = WIDGET_REGISTRY.find((item) => item.type === type);
  if (!entry) return false;
  return entry.category === "Markets" || entry.category === "Portfolio";
}
