import { expect, test } from "@playwright/test";

test.describe("widget composition", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      window.localStorage.removeItem("workbench-layout-v1");
    });
    await page.reload();
    await expect(page.locator(".workspace-grid")).toBeVisible();
    await page
      .getByRole("banner", { name: "Workspace toolbar" })
      .getByRole("button", { name: "Screen 1", exact: true })
      .click();
    await expect(
      page
        .getByRole("banner", { name: "Workspace toolbar" })
        .getByRole("button", { name: "Screen 1", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("adds, duplicates, removes widgets and respects singleton catalog state", async ({
    page,
  }) => {
    await expect(
      page.getByRole("button", { name: "Open widget catalog" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Open widget catalog" }).click();
    const catalog = page.getByRole("dialog", { name: "Widget catalog" });
    await expect(catalog).toBeVisible();

    const macroItem = catalog.locator("article").filter({ hasText: "Macro" });
    await expect(
      macroItem.getByRole("button", { name: "Added" }),
    ).toBeDisabled();

    const ratesChartItem = catalog
      .locator("article")
      .filter({ hasText: "Rates Chart" });
    await ratesChartItem.getByRole("button", { name: "Add" }).click();
    await page.keyboard.press("Escape");

    await expect(page.getByLabel("Rates Chart widget actions")).toHaveCount(2);

    await page.getByLabel("Rates Chart widget actions").first().click();
    await page.getByRole("menuitem", { name: "Duplicate" }).click();
    await expect(page.getByLabel("Rates Chart widget actions")).toHaveCount(3);

    await page.getByLabel("Rates Chart widget actions").last().click();
    await page.getByRole("menuitem", { name: "Remove" }).click();
    await expect(page.getByLabel("Rates Chart widget actions")).toHaveCount(2);

    await page.getByRole("button", { name: "Open widget catalog" }).click();
    await expect(catalog).toBeVisible();
  });
});
