import { expect, test } from "@playwright/test";
import {
  captureBrowserDiagnostics,
  mockStableWorkbenchApis,
  openCleanWorkbench,
  switchToScreen,
} from "./helpers/workbench";

const NAVIGATION_BUDGET_MS = Number(
  process.env.WORKBENCH_PERF_BUDGET_NAV_MS ?? 10_000,
);
const RENDER_BUDGET_MS = Number(
  process.env.WORKBENCH_PERF_BUDGET_RENDER_MS ?? 12_000,
);
const API_BUDGET_MS = Number(
  process.env.WORKBENCH_PERF_BUDGET_API_MS ?? 2_000,
);
const DATA_QUERY_BUDGET_MS = Number(
  process.env.WORKBENCH_PERF_BUDGET_DATA_QUERY_MS ?? 4_000,
);

test.describe("@perf workbench performance budgets", () => {
  test.beforeEach(async ({ page }) => {
    await mockStableWorkbenchApis(page);
  });

  test("loads and renders the portfolio workspace within baseline budgets", async ({
    page,
  }, testInfo) => {
    const diagnostics = captureBrowserDiagnostics(page);
    const startedAt = performance.now();

    await openCleanWorkbench(page);
    await switchToScreen(page, "Portfolio");
    await expect(page.getByText("UK Gilt 3.75% 2038")).toBeVisible();

    const renderMs = performance.now() - startedAt;
    const navTiming = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
      const paints = Object.fromEntries(
        performance
          .getEntriesByType("paint")
          .map((entry) => [entry.name, Math.round(entry.startTime)]),
      );

      return nav
        ? {
            domContentLoadedMs: Math.round(
              nav.domContentLoadedEventEnd - nav.startTime,
            ),
            loadMs: Math.round(nav.loadEventEnd - nav.startTime),
            transferSize: nav.transferSize,
            encodedBodySize: nav.encodedBodySize,
            paints,
          }
        : null;
    });

    await testInfo.attach("performance-navigation.json", {
      contentType: "application/json",
      body: JSON.stringify(
        { renderMs: Math.round(renderMs), navTiming },
        null,
        2,
      ),
    });

    expect(renderMs).toBeLessThan(RENDER_BUDGET_MS);
    expect(navTiming?.domContentLoadedMs ?? 0).toBeLessThan(
      NAVIGATION_BUDGET_MS,
    );
    await diagnostics.assertClean();
  });

  test("keeps critical API paths within baseline budgets", async ({
    page,
  }, testInfo) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const timings = await page.evaluate(
      async () => {
        async function measure<T>(name: string, run: () => Promise<T>) {
          const startedAt = performance.now();
          const result = await run();
          return {
            name,
            durationMs: Math.round(performance.now() - startedAt),
            result,
          };
        }

        const health = await measure("health", async () => {
          const response = await fetch("/health");
          return { ok: response.ok, status: response.status };
        });

        const portfolio = await measure("portfolio.positions", async () => {
          const response = await fetch("/api/data/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ moniker: "portfolio.positions" }),
          });
          const body = (await response.json()) as {
            results?: unknown[];
            shape?: string;
          };
          return {
            ok: response.ok,
            status: response.status,
            shape: body.shape,
            count: body.results?.length ?? 0,
          };
        });

        return { health, portfolio };
      },
    );

    await testInfo.attach("performance-api.json", {
      contentType: "application/json",
      body: JSON.stringify(timings, null, 2),
    });

    expect(timings.health.result).toMatchObject({ ok: true, status: 200 });
    expect(timings.health.durationMs).toBeLessThan(API_BUDGET_MS);
    expect(timings.portfolio.result).toMatchObject({
      ok: true,
      status: 200,
      shape: "table",
      count: 8,
    });
    expect(timings.portfolio.durationMs).toBeLessThan(DATA_QUERY_BUDGET_MS);
  });
});
