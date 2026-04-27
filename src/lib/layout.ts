export type WidgetType =
  | "macro-strip"
  | "macro-timeseries"
  | "yield-curve"
  | "macro-watchlist"
  | "placeholder-chart"
  | "placeholder-watchlist"
  | "placeholder-chat"
  | "placeholder-news";

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

export interface WorkspaceLayout {
  version: 3;
  userId: string;
  widgets: WidgetDefinition[];
  grid: LayoutItem[];
}

const STORAGE_KEY = "workbench-layout-v1";
const LAYOUT_VERSION = 3;

const DEFAULT_WIDGETS: WidgetDefinition[] = [
  { id: "macro-1", type: "macro-strip", title: "Macro" },
  { id: "macro-timeseries-1", type: "macro-timeseries", title: "Rates Chart" },
  { id: "macro-watchlist-1", type: "macro-watchlist", title: "Key Rates" },
  { id: "chat-1", type: "placeholder-chat", title: "AI Chat" },
  { id: "news-1", type: "placeholder-news", title: "News" },
];

const DEFAULT_GRID: LayoutItem[] = [
  { i: "macro-1", x: 0, y: 0, w: 12, h: 3, minW: 6, minH: 2 },
  { i: "macro-timeseries-1", x: 0, y: 3, w: 8, h: 10, minW: 4, minH: 4 },
  { i: "macro-watchlist-1", x: 8, y: 3, w: 4, h: 10, minW: 2, minH: 4 },
  { i: "chat-1", x: 0, y: 13, w: 6, h: 7, minW: 3, minH: 3 },
  { i: "news-1", x: 6, y: 13, w: 6, h: 7, minW: 2, minH: 3 },
];

export function buildDefaultLayout(userId: string): WorkspaceLayout {
  return {
    version: LAYOUT_VERSION,
    userId,
    widgets: structuredClone(DEFAULT_WIDGETS),
    grid: structuredClone(DEFAULT_GRID),
  };
}

export function loadLayout(userId: string): WorkspaceLayout {
  if (typeof window === "undefined") return buildDefaultLayout(userId);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildDefaultLayout(userId);
    const parsed = JSON.parse(raw) as WorkspaceLayout;
    if (parsed.version !== LAYOUT_VERSION || parsed.userId !== userId)
      return buildDefaultLayout(userId);
    return parsed;
  } catch {
    return buildDefaultLayout(userId);
  }
}

export function saveLayout(layout: WorkspaceLayout): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}
