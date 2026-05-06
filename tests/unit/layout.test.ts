import { afterEach, describe, expect, it, vi } from "vitest";

import {
  APIS_SCREEN_ID,
  buildDefaultLayout,
  loadLayout,
  type LayoutItem,
  type Screen,
  type WidgetDefinition,
} from "../../src/lib/layout";

const STORAGE_KEY = "workbench-layout-v1";

function screenById(screens: Screen[], id: string): Screen {
  const screen = screens.find((candidate) => candidate.id === id);
  expect(screen, `screen ${id}`).toBeDefined();
  return screen as Screen;
}

function widgetById(screen: Screen, id: string): WidgetDefinition {
  const widget = screen.widgets.find((candidate) => candidate.id === id);
  expect(widget, `widget ${id}`).toBeDefined();
  return widget as WidgetDefinition;
}

function gridById(screen: Screen, id: string): LayoutItem {
  const item = screen.grid.find((candidate) => candidate.i === id);
  expect(item, `grid item ${id}`).toBeDefined();
  return item as LayoutItem;
}

function installLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  };

  vi.stubGlobal("window", { localStorage });
  return localStorage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("workspace layout defaults", () => {
  it("builds the expected default screen set", () => {
    const layout = buildDefaultLayout("test-user");

    expect(layout.version).toBe(12);
    expect(layout.activeScreenId).toBe("screen-3");
    expect(layout.screens.map((screen) => [screen.id, screen.name])).toEqual([
      ["screen-1", "Home"],
      ["screen-2", "Equity"],
      ["screen-3", "Jupyter"],
      ["screen-4", "Portfolio"],
      ["screen-catalog", "Catalog"],
      ["screen-charts", "Charts"],
      [APIS_SCREEN_ID, "APIs"],
    ]);
  });

  it("keeps every default screen grid aligned to widget definitions", () => {
    const layout = buildDefaultLayout("test-user");

    for (const screen of layout.screens) {
      const widgetIds = screen.widgets.map((widget) => widget.id).sort();
      const gridIds = screen.grid.map((item) => item.i).sort();

      expect(gridIds, `${screen.name} grid ids`).toEqual(widgetIds);
      for (const item of screen.grid) {
        expect(item.x, `${screen.name}/${item.i} x`).toBeGreaterThanOrEqual(0);
        expect(item.y, `${screen.name}/${item.i} y`).toBeGreaterThanOrEqual(0);
        expect(item.w, `${screen.name}/${item.i} w`).toBeGreaterThan(0);
        expect(item.h, `${screen.name}/${item.i} h`).toBeGreaterThan(0);
        expect(
          item.x + item.w,
          `${screen.name}/${item.i} columns`,
        ).toBeLessThanOrEqual(12);
      }
    }
  });

  it("positions Home with GDELT top-right and symbol News bottom-left", () => {
    const home = screenById(
      buildDefaultLayout("test-user").screens,
      "screen-1",
    );

    expect(widgetById(home, "news-1")).toMatchObject({
      type: "placeholder-news",
      title: "GDELT Consensus",
      config: { moniker: "news/gdelt" },
    });
    expect(gridById(home, "news-1")).toMatchObject({
      x: 8,
      y: 0,
      w: 4,
      h: 4,
    });

    expect(widgetById(home, "news-feed-1")).toMatchObject({
      type: "news-feed",
      title: "News",
      config: { moniker: "news.company/SPY,QQQ" },
    });
    expect(gridById(home, "news-feed-1")).toMatchObject({
      x: 0,
      y: 14,
      w: 6,
      h: 7,
    });
    expect(gridById(home, "chat-1")).toMatchObject({
      x: 6,
      y: 14,
      w: 6,
      h: 7,
    });
  });

  it("positions the APIs screen as a full-width Hybrid Brinson workbench", () => {
    const apis = screenById(
      buildDefaultLayout("test-user").screens,
      APIS_SCREEN_ID,
    );

    expect(apis.widgets).toEqual([
      {
        id: "brinson-1",
        type: "hybrid-brinson",
        title: "Hybrid Brinson",
        config: { moniker: "fixed.income/govies/sovereign" },
      },
    ]);
    expect(apis.grid).toEqual([
      { i: "brinson-1", x: 0, y: 0, w: 12, h: 18, minW: 6, minH: 8 },
    ]);
  });
});

describe("workspace layout migrations", () => {
  it("migrates v3 layouts into the complete default screen set", () => {
    const localStorage = installLocalStorage();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        userId: "test-user",
        widgets: [{ id: "legacy-1", type: "chart", title: "Legacy Chart" }],
        grid: [{ i: "legacy-1", x: 0, y: 0, w: 12, h: 10 }],
      }),
    );

    const layout = loadLayout("test-user");

    expect(layout.version).toBe(12);
    expect(layout.screens.map((screen) => [screen.id, screen.name])).toEqual([
      ["screen-1", "Home"],
      ["screen-2", "Equity"],
      ["screen-3", "Jupyter"],
      ["screen-4", "Portfolio"],
      ["screen-catalog", "Catalog"],
      ["screen-charts", "Charts"],
      [APIS_SCREEN_ID, "APIs"],
    ]);
    expect(screenById(layout.screens, "screen-1").widgets).toEqual([
      { id: "legacy-1", type: "chart", title: "Legacy Chart" },
    ]);
  });

  it("repairs saved Home layouts that predate the separate News widget", () => {
    const localStorage = installLocalStorage();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 11,
        userId: "test-user",
        activeScreenId: "screen-1",
        screens: [
          {
            id: "screen-1",
            name: "Home",
            widgets: [
              { id: "macro-1", type: "macro-strip", title: "Macro" },
              {
                id: "macro-timeseries-1",
                type: "macro-timeseries",
                title: "Rates Chart",
                config: { moniker: "macro.indicators/DGS2" },
              },
              {
                id: "macro-watchlist-1",
                type: "macro-watchlist",
                title: "Key Rates",
              },
              { id: "chat-1", type: "placeholder-chat", title: "AI Chat" },
              {
                id: "news-1",
                type: "placeholder-news",
                title: "News",
                config: { moniker: "news.company/SPY,QQQ" },
              },
            ],
            grid: [
              { i: "macro-1", x: 0, y: 0, w: 12, h: 4 },
              { i: "macro-timeseries-1", x: 0, y: 4, w: 8, h: 10 },
              { i: "macro-watchlist-1", x: 8, y: 4, w: 4, h: 10 },
              { i: "news-1", x: 0, y: 14, w: 6, h: 7 },
              { i: "chat-1", x: 6, y: 14, w: 6, h: 7 },
            ],
          },
        ],
      }),
    );

    const layout = loadLayout("test-user");
    const home = screenById(layout.screens, "screen-1");

    expect(layout.version).toBe(12);
    expect(layout.activeScreenId).toBe("screen-1");
    expect(widgetById(home, "macro-timeseries-1").config).toMatchObject({
      moniker: "macro.indicators/DGS10",
    });
    expect(widgetById(home, "news-1")).toMatchObject({
      title: "GDELT Consensus",
      config: { moniker: "news/gdelt" },
    });
    expect(gridById(home, "news-1")).toMatchObject({
      x: 8,
      y: 0,
      w: 4,
      h: 4,
    });
    expect(widgetById(home, "news-feed-1")).toMatchObject({
      type: "news-feed",
      title: "News",
      config: { moniker: "news.company/SPY,QQQ" },
    });
    expect(gridById(home, "news-feed-1")).toMatchObject({
      x: 0,
      y: 14,
      w: 6,
      h: 7,
    });
  });
});
