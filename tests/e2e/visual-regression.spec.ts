import { expect, test } from "@playwright/test";
import {
  captureBrowserDiagnostics,
  mockStableWorkbenchApis,
  openCleanWorkbench,
  switchToScreen,
} from "./helpers/workbench";

test.describe("@visual workbench regression", () => {
  test.beforeEach(async ({ page }) => {
    await mockStableWorkbenchApis(page);
  });

  test("portfolio screen visual baseline", async ({ page }) => {
    const diagnostics = captureBrowserDiagnostics(page);

    await openCleanWorkbench(page);
    await switchToScreen(page, "Portfolio");

    await expect(page.getByText("P&L Summary")).toBeVisible();
    await expect(page.getByText("UK Gilt 3.75% 2038")).toBeVisible();
    await expect(page.locator(".workspace")).toHaveScreenshot(
      "portfolio-screen.png",
      {
        maxDiffPixelRatio: 0.012,
      },
    );

    await diagnostics.assertClean();
  });

  test("widget catalog visual baseline", async ({ page }) => {
    const diagnostics = captureBrowserDiagnostics(page);

    await openCleanWorkbench(page);
    await page.getByRole("button", { name: "Open widget catalog" }).click();

    const catalog = page.getByRole("dialog", { name: "Widget catalog" });
    await expect(catalog).toBeVisible();
    await expect(catalog.getByText("Rates Chart")).toBeVisible();
    await expect(catalog).toHaveScreenshot("widget-catalog.png");

    await diagnostics.assertClean();
  });
});
