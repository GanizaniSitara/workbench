import { expect, test, type Page } from "@playwright/test";
import {
  mockStableWorkbenchApis,
  mockStableWidgetData,
  openCleanWorkbench,
} from "./helpers/workbench";

interface StoredWidget {
  id: string;
  type: string;
  title: string;
  config?: Record<string, string>;
}

interface StoredGridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

interface StoredScreen {
  id: string;
  name: string;
  widgets: StoredWidget[];
  grid: StoredGridItem[];
}

interface StoredLayout {
  version: number;
  activeScreenId: string;
  screens: StoredScreen[];
}

async function readStoredLayout(page: Page): Promise<StoredLayout> {
  await page.waitForFunction(() => {
    const raw = window.localStorage.getItem("workbench-layout-v1");
    return raw ? JSON.parse(raw).version === 12 : false;
  });

  return page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("workbench-layout-v1") ?? "{}"),
  ) as Promise<StoredLayout>;
}

function screenById(layout: StoredLayout, id: string): StoredScreen {
  const screen = layout.screens.find((candidate) => candidate.id === id);
  expect(screen, `screen ${id}`).toBeDefined();
  return screen as StoredScreen;
}

function widgetById(screen: StoredScreen, id: string): StoredWidget {
  const widget = screen.widgets.find((candidate) => candidate.id === id);
  expect(widget, `widget ${id}`).toBeDefined();
  return widget as StoredWidget;
}

function gridById(screen: StoredScreen, id: string): StoredGridItem {
  const item = screen.grid.find((candidate) => candidate.i === id);
  expect(item, `grid item ${id}`).toBeDefined();
  return item as StoredGridItem;
}

test.describe("screen layout contracts", () => {
  test.beforeEach(async ({ page }) => {
    await mockStableWorkbenchApis(page);
    await mockStableWidgetData(page);
  });

  test("persists the expected default screen set and widget geometry", async ({
    page,
  }) => {
    await openCleanWorkbench(page);

    const layout = await readStoredLayout(page);

    expect(layout.activeScreenId).toBe("screen-3");
    expect(layout.screens.map((screen) => [screen.id, screen.name])).toEqual([
      ["screen-1", "Home"],
      ["screen-2", "Equity"],
      ["screen-3", "Jupyter"],
      ["screen-4", "Portfolio"],
      ["screen-catalog", "Catalog"],
      ["screen-charts", "Charts"],
      ["screen-apis", "APIs"],
    ]);

    const home = screenById(layout, "screen-1");
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

    const apis = screenById(layout, "screen-apis");
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

  test("migrates older Home layouts into separate GDELT and News widgets", async ({
    page,
  }) => {
    const legacyLayout = {
      version: 11,
      userId: "dev-user",
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
    };
    await page.addInitScript((layout) => {
      window.localStorage.setItem(
        "workbench-layout-v1",
        JSON.stringify(layout),
      );
    }, legacyLayout);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("banner", { name: "Workspace toolbar" }),
    ).toBeVisible();

    const layout = await readStoredLayout(page);
    const home = screenById(layout, "screen-1");

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
