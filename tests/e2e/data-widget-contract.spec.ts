import { expect, test } from "@playwright/test";
import {
  captureBrowserDiagnostics,
  mockStableWorkbenchApis,
  mockStableWidgetData,
  openCleanWorkbench,
  switchToScreen,
} from "./helpers/workbench";

test.describe("data-backed widgets", () => {
  test.beforeEach(async ({ page }) => {
    await mockStableWorkbenchApis(page);
    await mockStableWidgetData(page);
  });

  test("markets widgets render deterministic fixture data", async ({
    page,
  }) => {
    const diagnostics = captureBrowserDiagnostics(page);

    await openCleanWorkbench(page);
    await switchToScreen(page, "Home");

    await expect(page.getByLabel("Macro indicators")).toContainText(
      "Fed Funds Rate",
    );
    await expect(page.getByLabel("Macro indicators")).toContainText("4.33%");
    await expect(page.getByLabel("Macro indicators")).toContainText(
      "10Y Treasury",
    );
    await expect(page.getByLabel("Macro indicators")).toContainText("4.18%");
    await expect(page.getByText("GDELT Consensus")).toBeVisible();
    await expect(
      page.getByText("Treasury curve steepens").first(),
    ).toBeVisible();
    await expect(page.getByText("2 headlines").first()).toBeVisible();

    await diagnostics.assertClean();
  });

  test("rates and equity widgets render deterministic fixture data", async ({
    page,
  }) => {
    const diagnostics = captureBrowserDiagnostics(page);

    await openCleanWorkbench(page);
    await switchToScreen(page, "Equity");

    await expect(page.getByText("Equity Chart")).toBeVisible();
    await expect(page.getByLabel("Ticker symbol")).toHaveValue("AAPL");
    await expect(page.getByText("$211.05")).toBeVisible();
    await expect(page.getByText("AI Chat")).toBeVisible();

    await diagnostics.assertClean();
  });

  test("portfolio widgets render summary, table, exposure, and drilldown", async ({
    page,
  }) => {
    const diagnostics = captureBrowserDiagnostics(page);

    await openCleanWorkbench(page);
    await switchToScreen(page, "Portfolio");

    await expect(page.locator(".pnl-summary")).toContainText("£24.1m");
    await expect(page.locator(".pnl-summary")).toContainText("2 positions");
    await expect(page.getByText("UK Gilt 4.25% 2034")).toBeVisible();
    await expect(page.getByText("By Asset Class")).toBeVisible();

    await page.getByText("UK Gilt 3.75% 2038").click();
    await expect(page.getByText("GB00BM8Z2S06 · Gilt · GBP")).toBeVisible();
    await expect(page.getByLabel("30-day unrealised P&L")).toBeVisible();

    await diagnostics.assertClean();
  });
});
