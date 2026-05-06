import { expect, test } from "@playwright/test";
import {
  mockStableWorkbenchApis,
  mockStableWidgetData,
  openCleanWorkbench,
} from "./helpers/workbench";

test.describe("Open Moniker provenance", () => {
  test.beforeEach(async ({ page }) => {
    await mockStableWorkbenchApis(page);
    await mockStableWidgetData(page);
  });

  test("shows whether the moniker tree came from the resolver", async ({
    page,
  }) => {
    await openCleanWorkbench(page);

    const source = page.getByLabel(
      "Catalog source: Open Moniker resolver: http://resolver.fixture",
    );

    await expect(source).toBeVisible();
    await expect(source).toHaveText("Resolver");
  });
});
