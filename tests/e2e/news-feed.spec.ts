import { expect, test } from "@playwright/test";
import {
  mockStableWorkbenchApis,
  mockStableWidgetData,
  openCleanWorkbench,
  switchToScreen,
} from "./helpers/workbench";

test.describe("news feed", () => {
  test.beforeEach(async ({ page }) => {
    await mockStableWorkbenchApis(page);
    await mockStableWidgetData(page);
  });

  test("keeps the ticker list empty after removing the last chip", async ({
    page,
  }) => {
    await openCleanWorkbench(page);
    await switchToScreen(page, "Home");

    await expect(page.getByLabel("Remove SPY")).toBeVisible();
    await page.getByLabel("Remove SPY").click();
    await expect(page.getByLabel("Remove SPY")).toHaveCount(0);
    await expect(page.getByLabel("Remove QQQ")).toBeVisible();

    await page.getByLabel("Remove QQQ").click();
    await expect(page.getByLabel("Remove QQQ")).toHaveCount(0);
    await expect(page.getByLabel("Remove SPY")).toHaveCount(0);
    await expect(
      page.getByText("Add a ticker to load headlines"),
    ).toBeVisible();
    await page.waitForFunction(() => {
      const raw = window.localStorage.getItem("workbench-layout-v1");
      if (!raw) return false;
      const layout = JSON.parse(raw);
      const home = layout.screens?.find(
        (screen: { id?: string }) => screen.id === "screen-1",
      );
      const newsFeed = home?.widgets?.find(
        (widget: { id?: string }) => widget.id === "news-feed-1",
      );
      return newsFeed?.config?.moniker === "news.company";
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByText("Add a ticker to load headlines"),
    ).toBeVisible();
    await expect(page.getByLabel("Remove SPY")).toHaveCount(0);
    await expect(page.getByLabel("Remove QQQ")).toHaveCount(0);
  });
});
