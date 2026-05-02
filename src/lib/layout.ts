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
  | "catalog"
  | "notebook"
  | "news-feed"
  | "event-context"
  | "research-panel"
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
  version: 10;
  userId: string;
  screens: Screen[];
  activeScreenId: string;
}

export const CATALOG_SCREEN_ID = "screen-catalog";

const STORAGE_KEY = "workbench-layout-v1";
const LAYOUT_VERSION = 10;

const SCREEN1_WIDGETS: WidgetDefinition[] = [
  { id: "macro-1", type: "macro-strip", title: "Macro" },
  {
    id: "macro-timeseries-1",
    type: "macro-timeseries",
    title: "Rates Chart",
    config: { moniker: "macro.indicators/DGS10" },
  },
  { id: "macro-watchlist-1", type: "macro-watchlist", title: "Key Rates" },
  { id: "chat-1", type: "placeholder-chat", title: "AI Chat" },
  {
    id: "news-1",
    type: "placeholder-news",
    title: "GDELT Consensus",
    config: { moniker: "news/gdelt" },
  },
];

const SCREEN1_GRID: LayoutItem[] = [
  { i: "macro-1", x: 0, y: 0, w: 8, h: 4, minW: 6, minH: 2 },
  { i: "news-1", x: 8, y: 0, w: 4, h: 4, minW: 2, minH: 3 },
  { i: "macro-timeseries-1", x: 0, y: 4, w: 8, h: 10, minW: 4, minH: 4 },
  { i: "macro-watchlist-1", x: 8, y: 4, w: 4, h: 10, minW: 2, minH: 4 },
  { i: "chat-1", x: 0, y: 14, w: 12, h: 6, minW: 3, minH: 3 },
];

const SCREEN2_WIDGETS: WidgetDefinition[] = [
  { id: "equity-1", type: "equity-chart", title: "Equity Chart" },
  {
    id: "equity-chat-1",
    type: "placeholder-chat",
    title: "AI Chat",
    config: { sessionId: "equity-chat" },
  },
];

const SCREEN2_GRID: LayoutItem[] = [
  { i: "equity-chat-1", x: 0, y: 0, w: 12, h: 7, minW: 6, minH: 4 },
  { i: "equity-1", x: 0, y: 7, w: 12, h: 10, minW: 4, minH: 4 },
];

const JUPYTER_WIDGETS: WidgetDefinition[] = [
  {
    id: "notebook-jupyter",
    type: "notebook",
    title: "Research Notebook",
    config: { notebookId: "jupyter-main" },
  },
];

const JUPYTER_GRID: LayoutItem[] = [
  { i: "notebook-jupyter", x: 0, y: 0, w: 12, h: 20, minW: 6, minH: 10 },
];

const PORTFOLIO_WIDGETS: WidgetDefinition[] = [
  { id: "pnl-1", type: "pnl-summary", title: "P&L Summary" },
  { id: "positions-1", type: "positions-table", title: "Positions" },
  { id: "exposure-1", type: "exposure-card", title: "Exposure" },
  { id: "detail-1", type: "position-detail", title: "Position Detail" },
];

const PORTFOLIO_GRID: LayoutItem[] = [
  { i: "pnl-1", x: 0, y: 0, w: 12, h: 4, minW: 6, minH: 3 },
  { i: "positions-1", x: 0, y: 4, w: 8, h: 10, minW: 5, minH: 5 },
  { i: "exposure-1", x: 8, y: 4, w: 4, h: 10, minW: 3, minH: 5 },
  { i: "detail-1", x: 0, y: 14, w: 12, h: 8, minW: 5, minH: 4 },
];

const CATALOG_WIDGETS: WidgetDefinition[] = [
  {
    id: "catalog-main",
    type: "catalog",
    title: "Business Catalog",
  },
];

const CATALOG_GRID: LayoutItem[] = [
  { i: "catalog-main", x: 0, y: 0, w: 12, h: 20, minW: 8, minH: 12 },
];

function buildCatalogScreen(): Screen {
  return {
    id: CATALOG_SCREEN_ID,
    name: "Catalog",
    widgets: structuredClone(CATALOG_WIDGETS),
    grid: structuredClone(CATALOG_GRID),
  };
}

function normalizeScreenName(screen: Screen): Screen {
  if (screen.id === "screen-1" && screen.name === "Screen 1") {
    return { ...screen, name: "Home" };
  }
  if (screen.id === "screen-2" && screen.name === "Screen 2") {
    return { ...screen, name: "Equity" };
  }
  return screen;
}

function normalizeScreenGrid(screen: Screen): Screen {
  if (screen.id !== "screen-2") return screen;

  return {
    ...screen,
    widgets: [
      ...screen.widgets.filter((widget) => widget.id !== "ref-rates-1"),
      ...(screen.widgets.some((widget) => widget.id === "equity-chat-1")
        ? []
        : [
            {
              id: "equity-chat-1",
              type: "placeholder-chat" as const,
              title: "AI Chat",
              config: { sessionId: "equity-chat" },
            },
          ]),
    ],
    grid: [
      ...screen.grid
        .filter(
          (item) => item.i !== "ref-rates-1" && item.i !== "equity-chat-1",
        )
        .map((item) =>
          item.i === "equity-1"
            ? { ...item, x: 0, y: 7, w: 12, h: Math.max(item.h, 10) }
            : item,
        ),
      { i: "equity-chat-1", x: 0, y: 0, w: 12, h: 7, minW: 6, minH: 4 },
    ],
  };
}

function normalizeHomeGdeltLayout(screen: Screen): Screen {
  if (screen.id !== "screen-1") return screen;

  const hasNewsWidget = screen.widgets.some((widget) => widget.id === "news-1");
  const widgets = [
    ...screen.widgets.map((widget) =>
      widget.id === "macro-timeseries-1"
        ? {
            ...widget,
            config: {
              ...widget.config,
              moniker: "macro.indicators/DGS10",
            },
          }
        : widget.id === "news-1"
          ? {
              ...widget,
              title: "GDELT Consensus",
              config: { ...widget.config, moniker: "news/gdelt" },
            }
          : widget,
    ),
    ...(hasNewsWidget
      ? []
      : [
          {
            id: "news-1",
            type: "placeholder-news" as const,
            title: "GDELT Consensus",
            config: { moniker: "news/gdelt" },
          },
        ]),
  ];

  const hasNewsGrid = screen.grid.some((item) => item.i === "news-1");
  const grid = [
    ...screen.grid.map((item) => {
      if (item.i === "macro-1") {
        return { ...item, x: 0, y: 0, w: 8, h: 4, minW: 6, minH: 2 };
      }
      if (item.i === "news-1") {
        return { ...item, x: 8, y: 0, w: 4, h: 4, minW: 2, minH: 3 };
      }
      if (item.i === "macro-timeseries-1") {
        return { ...item, x: 0, y: 4, w: 8, h: 10, minW: 4, minH: 4 };
      }
      if (item.i === "macro-watchlist-1") {
        return { ...item, x: 8, y: 4, w: 4, h: 10, minW: 2, minH: 4 };
      }
      if (item.i === "chat-1") {
        return { ...item, x: 0, y: 14, w: 12, h: 6, minW: 3, minH: 3 };
      }
      return item;
    }),
    ...(hasNewsGrid
      ? []
      : [{ i: "news-1", x: 8, y: 0, w: 4, h: 4, minW: 2, minH: 3 }]),
  ];

  return {
    ...screen,
    widgets,
    grid,
  };
}

function buildJupyterScreen(): Screen {
  return {
    id: "screen-3",
    name: "Jupyter",
    widgets: structuredClone(JUPYTER_WIDGETS),
    grid: structuredClone(JUPYTER_GRID),
  };
}

function buildPortfolioScreen(): Screen {
  return {
    id: "screen-4",
    name: "Portfolio",
    widgets: structuredClone(PORTFOLIO_WIDGETS),
    grid: structuredClone(PORTFOLIO_GRID),
  };
}

function withJupyterScreen(screens: Screen[]): Screen[] {
  const withoutJupyter = screens.filter(
    (screen) =>
      screen.id !== "screen-3" &&
      screen.id !== "screen-jupyter" &&
      screen.name.trim().toLowerCase() !== "jupyter",
  );

  return [...withoutJupyter, buildJupyterScreen()];
}

function withCatalogScreen(screens: Screen[]): Screen[] {
  const withoutCatalog = screens.filter(
    (screen) =>
      screen.id !== CATALOG_SCREEN_ID &&
      screen.name.trim().toLowerCase() !== "catalog",
  );
  return [...withoutCatalog, buildCatalogScreen()];
}

function withPortfolioScreen(screens: Screen[]): Screen[] {
  const withoutPortfolio = screens.filter(
    (screen) =>
      screen.id !== "screen-4" &&
      screen.id !== "screen-portfolio" &&
      screen.name.trim().toLowerCase() !== "portfolio",
  );

  return [...withoutPortfolio, buildPortfolioScreen()];
}

function withDefaultScreens(screens: Screen[]): Screen[] {
  return withCatalogScreen(withPortfolioScreen(withJupyterScreen(screens))).map(
    (screen) =>
      normalizeHomeGdeltLayout(
        normalizeScreenGrid(normalizeScreenName(screen)),
      ),
  );
}

export function buildDefaultLayout(userId: string): WorkspaceLayout {
  return {
    version: LAYOUT_VERSION,
    userId,
    activeScreenId: "screen-3",
    screens: [
      {
        id: "screen-1",
        name: "Home",
        widgets: structuredClone(SCREEN1_WIDGETS),
        grid: structuredClone(SCREEN1_GRID),
      },
      {
        id: "screen-2",
        name: "Equity",
        widgets: structuredClone(SCREEN2_WIDGETS),
        grid: structuredClone(SCREEN2_GRID),
      },
      {
        id: "screen-3",
        name: "Jupyter",
        widgets: structuredClone(JUPYTER_WIDGETS),
        grid: structuredClone(JUPYTER_GRID),
      },
      {
        id: "screen-4",
        name: "Portfolio",
        widgets: structuredClone(PORTFOLIO_WIDGETS),
        grid: structuredClone(PORTFOLIO_GRID),
      },
      buildCatalogScreen(),
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
    // Migrate v3 -> v7: wrap existing widgets/grid into screen-1, seed default screens.
    if (parsed.version === 3 && parsed.userId === userId) {
      const defaults = buildDefaultLayout(userId);
      return {
        version: LAYOUT_VERSION,
        userId,
        activeScreenId: "screen-3",
        screens: [
          {
            id: "screen-1",
            name: "Home",
            widgets: parsed.widgets ?? [],
            grid: parsed.grid ?? [],
          },
          defaults.screens[1],
          defaults.screens[2],
          defaults.screens[3],
          defaults.screens[4],
        ],
      };
    }

    // Migrate v4/v5/v6 -> v10: preserve existing screens and ensure default screens.
    if (
      (parsed.version === 4 || parsed.version === 5 || parsed.version === 6) &&
      parsed.userId === userId
    ) {
      return {
        version: LAYOUT_VERSION,
        userId,
        activeScreenId: "screen-3",
        screens: withDefaultScreens(parsed.screens ?? []),
      };
    }

    // Migrate v7/v8/v9 -> v10: add catalog screen and normalize default grids.
    if (
      (parsed.version === 7 || parsed.version === 8 || parsed.version === 9) &&
      parsed.userId === userId
    ) {
      return {
        version: LAYOUT_VERSION,
        userId,
        activeScreenId:
          (parsed as WorkspaceLayout).activeScreenId ?? "screen-3",
        screens: withDefaultScreens((parsed as WorkspaceLayout).screens ?? []),
      };
    }

    if (parsed.version !== LAYOUT_VERSION || parsed.userId !== userId)
      return buildDefaultLayout(userId);

    const screens = withDefaultScreens((parsed as WorkspaceLayout).screens);
    const activeScreenId = screens.some(
      (screen) => screen.id === (parsed as WorkspaceLayout).activeScreenId,
    )
      ? (parsed as WorkspaceLayout).activeScreenId
      : "screen-3";

    return {
      ...(parsed as WorkspaceLayout),
      activeScreenId,
      screens,
    };
  } catch {
    return buildDefaultLayout(userId);
  }
}

export function saveLayout(layout: WorkspaceLayout): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}
