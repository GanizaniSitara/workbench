import { expect, type Page } from "@playwright/test";

const MONIKER_TREE_FIXTURE = {
  tree: [
    {
      path: "portfolio",
      name: "Portfolio",
      source_type: null,
      has_source_binding: false,
      children: [
        {
          path: "portfolio.positions",
          name: "Positions",
          source_type: "portfolio-adapter",
          has_source_binding: true,
          children: [],
        },
        {
          path: "portfolio.summary",
          name: "Summary",
          source_type: "portfolio-adapter",
          has_source_binding: true,
          children: [],
        },
      ],
    },
    {
      path: "macro.indicators",
      name: "Macro indicators",
      source_type: "openbb",
      has_source_binding: true,
      children: [],
    },
  ],
};

export function captureBrowserDiagnostics(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    failedRequests.push(`${request.method()} ${request.url()} ${failure?.errorText ?? ""}`.trim());
  });

  return {
    async assertClean() {
      expect.soft(consoleErrors, "browser console errors").toEqual([]);
      expect.soft(pageErrors, "uncaught browser errors").toEqual([]);
      expect.soft(failedRequests, "failed browser requests").toEqual([]);
    },
  };
}

export async function mockStableWorkbenchApis(page: Page) {
  await page.route("**/api/data/moniker-tree", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(MONIKER_TREE_FIXTURE),
    });
  });

  await page.route("http://127.0.0.1:8888/**", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html><body>Notebook unavailable in tests</body></html>",
    });
  });
}

export async function openCleanWorkbench(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.localStorage.removeItem("workbench-layout-v1");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("banner", { name: "Workspace toolbar" })).toBeVisible();
  await expect(page.locator(".workspace-grid")).toBeVisible();
}

export async function switchToScreen(page: Page, screenName: string) {
  const button = page
    .getByRole("banner", { name: "Workspace toolbar" })
    .getByRole("button", { name: screenName, exact: true });

  await button.click();
  await expect(button).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}
