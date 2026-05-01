export type WidgetType =
  | "macro-strip"
  | "macro-timeseries"
  | "yield-curve"
  | "macro-watchlist"
  | "reference-rates"
  | "equity-chart"
  | "placeholder-chart"
  | "placeholder-watchlist"
  | "placeholder-chat"
  | "placeholder-news"
  | "overlay-chart"
  | "positions-table"
  | "pnl-summary"
  | "exposure-card"
  | "position-detail";

export interface WidgetDefinition {
  id: string;
  type: WidgetType;
  title: string;
  config?: Record<string, string>;
}

export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export interface Screen {
  id: string;
  name: string;
  widgets: WidgetDefinition[];
  grid: LayoutItem[];
}

export interface WorkspaceLayout {
  version: 5;
  userId: string;
  screens: Screen[];
  activeScreenId: string;
}

const STORAGE_KEY = "workbench-layout-v1";
const LAYOUT_VERSION = 5;

const SCREEN1_WIDGETS: WidgetDefinition[] = [
  { id: "macro-1", type: "macro-strip", title: "Macro" },
  { id: "macro-timeseries-1", type: "macro-timeseries", title: "Rates Chart" },
  { id: "macro-watchlist-1", type: "macro-watchlist", title: "Key Rates" },
  { id: "chat-1", type: "placeholder-chat", title: "AI Chat" },
  { id: "news-1", type: "placeholder-news", title: "News" },
];

const SCREEN1_GRID: LayoutItem[] = [
  { i: "macro-1", x: 0, y: 0, w: 12, h: 3, minW: 6, minH: 2 },
  { i: "macro-timeseries-1", x: 0, y: 3, w: 8, h: 10, minW: 4, minH: 4 },
  { i: "macro-watchlist-1", x: 8, y: 3, w: 4, h: 10, minW: 2, minH: 4 },
  { i: "chat-1", x: 0, y: 13, w: 6, h: 7, minW: 3, minH: 3 },
  { i: "news-1", x: 6, y: 13, w: 6, h: 7, minW: 2, minH: 3 },
];

const SCREEN2_WIDGETS: WidgetDefinition[] = [
  { id: "ref-rates-1", type: "reference-rates", title: "Reference Rates" },
  { id: "equity-1", type: "equity-chart", title: "Equity Chart" },
];

const SCREEN2_GRID: LayoutItem[] = [
  { i: "ref-rates-1", x: 0, y: 0, w: 12, h: 3, minW: 6, minH: 2 },
  { i: "equity-1", x: 0, y: 3, w: 8, h: 10, minW: 4, minH: 4 },
];

const SCREEN3_WIDGETS: WidgetDefinition[] = [
  { id: "pnl-1", type: "pnl-summary", title: "P&L Summary" },
  { id: "positions-1", type: "positions-table", title: "Positions" },
  { id: "exposure-1", type: "exposure-card", title: "Exposure" },
  { id: "detail-1", type: "position-detail", title: "Position Detail" },
];

const SCREEN3_GRID: LayoutItem[] = [
  { i: "pnl-1", x: 0, y: 0, w: 12, h: 4, minW: 6, minH: 3 },
  { i: "positions-1", x: 0, y: 4, w: 8, h: 10, minW: 5, minH: 5 },
  { i: "exposure-1", x: 8, y: 4, w: 4, h: 10, minW: 3, minH: 5 },
  { i: "detail-1", x: 0, y: 14, w: 12, h: 8, minW: 5, minH: 4 },
];

export function buildDefaultLayout(userId: string): WorkspaceLayout {
  return {
    version: LAYOUT_VERSION,
    userId,
    activeScreenId: "screen-1",
    screens: [
      {
        id: "screen-1",
        name: "Screen 1",
        widgets: structuredClone(SCREEN1_WIDGETS),
        grid: structuredClone(SCREEN1_GRID),
      },
      {
        id: "screen-2",
        name: "Screen 2",
        widgets: structuredClone(SCREEN2_WIDGETS),
        grid: structuredClone(SCREEN2_GRID),
      },
      {
        id: "screen-3",
        name: "Portfolio",
        widgets: structuredClone(SCREEN3_WIDGETS),
        grid: structuredClone(SCREEN3_GRID),
      },
    ],
  };
}

export function loadLayout(userId: string): WorkspaceLayout {
  if (typeof window === "undefined") return buildDefaultLayout(userId);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildDefaultLayout(userId);
    const parsed = JSON.parse(raw) as {
      version: number;
      userId: string;
      widgets?: WidgetDefinition[];
      grid?: LayoutItem[];
      screens?: Screen[];
      activeScreenId?: string;
    };
    // Migrate v3 → v4: wrap existing widgets/grid into screen-1, seed screen-2 from defaults
    if (parsed.version === 3 && parsed.userId === userId) {
      const defaults = buildDefaultLayout(userId);
      return {
        version: 5,
        userId,
        activeScreenId: "screen-1",
        screens: [
          {
            id: "screen-1",
            name: "Screen 1",
            widgets: parsed.widgets ?? [],
            grid: parsed.grid ?? [],
          },
          defaults.screens[1],
          defaults.screens[2],
        ],
      };
    }
    // Migrate v4 → v5: append Portfolio screen-3 to existing layout
    if (parsed.version === 4 && parsed.userId === userId) {
      const defaults = buildDefaultLayout(userId);
      return {
        version: 5,
        userId,
        activeScreenId: parsed.activeScreenId ?? "screen-1",
        screens: [
          ...(parsed.screens ?? []),
          defaults.screens[2],
        ],
      };
    }
    if (parsed.version !== LAYOUT_VERSION || parsed.userId !== userId)
      return buildDefaultLayout(userId);
    return parsed as WorkspaceLayout;
  } catch {
    return buildDefaultLayout(userId);
  }
}

export function saveLayout(layout: WorkspaceLayout): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}
