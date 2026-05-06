import { expect, type Page } from "@playwright/test";

interface DataQueryRequest {
  moniker?: string;
  shape?: string;
  params?: Record<string, unknown>;
}

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

const MACRO_SNAPSHOT = {
  shape: "snapshot",
  results: [
    {
      id: "FEDFUNDS",
      label: "Fed Funds Rate",
      value: 4.33,
      date: "2026-04-30",
    },
    { id: "DGS2", label: "2Y Treasury", value: 3.72, date: "2026-04-30" },
    { id: "DGS10", label: "10Y Treasury", value: 4.18, date: "2026-04-30" },
    { id: "DGS30", label: "30Y Treasury", value: 4.74, date: "2026-04-30" },
    { id: "T10Y2Y", label: "10Y-2Y Spread", value: 0.46, date: "2026-04-30" },
    { id: "CPIAUCSL", label: "CPI", value: 319.8, date: "2026-04-30" },
    {
      id: "UNRATE",
      label: "Unemployment Rate",
      value: 4.1,
      date: "2026-04-30",
    },
    { id: "VIXCLS", label: "VIX", value: 16.25, date: "2026-04-30" },
  ],
};

const REFERENCE_RATES = {
  shape: "snapshot",
  results: [
    { id: "SONIA", label: "SONIA", value: 4.21, date: "2026-04-30" },
    { id: "SOFR", label: "SOFR", value: 4.34, date: "2026-04-30" },
    { id: "ESTR", label: "ESTR", value: 3.92, date: "2026-04-30" },
    { id: "EFFR", label: "EFFR", value: 4.33, date: "2026-04-30" },
  ],
};

const YIELD_CURVE = {
  shape: "curve",
  source: "fixture",
  results: [
    { maturity: "month1", rate: 4.42 },
    { maturity: "month3", rate: 4.36 },
    { maturity: "month6", rate: 4.28 },
    { maturity: "year1", rate: 4.05 },
    { maturity: "year2", rate: 3.72 },
    { maturity: "year5", rate: 3.88 },
    { maturity: "year10", rate: 4.18 },
    { maturity: "year20", rate: 4.54 },
    { maturity: "year30", rate: 4.74 },
  ],
};

const PORTFOLIO_POSITIONS = {
  shape: "table",
  results: [
    {
      id: "pos-001",
      isin: "GB00BM8Z2S06",
      description: "UK Gilt 3.75% 2038",
      assetClass: "Gilt",
      sector: "Government",
      quantity: 10_000_000,
      cleanPrice: 92.45,
      dirtyPrice: 93.28,
      costPrice: 91.2,
      marketValue: 9_328_000,
      bookValue: 9_120_000,
      unrealizedPnl: 208_000,
      realizedPnl: 45_000,
      yieldToMaturity: 4.42,
      duration: 8.71,
      maturityDate: "2038-10-22",
      currency: "GBP",
      dayChange: -18_500,
      dayChangePct: -0.2,
    },
    {
      id: "pos-002",
      isin: "GB0031829509",
      description: "UK Gilt 4.25% 2034",
      assetClass: "Gilt",
      sector: "Government",
      quantity: 15_000_000,
      cleanPrice: 97.84,
      dirtyPrice: 98.67,
      costPrice: 96.1,
      marketValue: 14_800_500,
      bookValue: 14_415_000,
      unrealizedPnl: 385_500,
      realizedPnl: 78_000,
      yieldToMaturity: 4.51,
      duration: 6.42,
      maturityDate: "2034-09-07",
      currency: "GBP",
      dayChange: 12_300,
      dayChangePct: 0.08,
    },
  ],
};

const PORTFOLIO_SUMMARY = {
  shape: "snapshot",
  results: {
    totalMarketValue: 24_128_500,
    totalBookValue: 23_535_000,
    totalUnrealizedPnl: 593_500,
    unrealizedPnlPct: 0.0252,
    totalRealizedPnl: 123_000,
    totalPnl: 716_500,
    totalPnlPct: 0.0304,
    totalDayChange: -6_200,
    dayChangePct: -0.00026,
    weightedDuration: 7.31,
    positionCount: 2,
  },
};

const PORTFOLIO_EXPOSURE = {
  shape: "snapshot",
  results: {
    total: 24_128_500,
    byAssetClass: [{ label: "Gilt", value: 24_128_500, pct: 1 }],
    bySector: [{ label: "Government", value: 24_128_500, pct: 1 }],
  },
};

const POSITION_DETAIL = {
  shape: "snapshot",
  results: PORTFOLIO_POSITIONS.results[0],
};

const POSITION_PNL = {
  shape: "timeseries",
  symbol: "pos-001",
  label: "Position P&L",
  format: "level",
  range: "30d",
  source: "fixture",
  results: Array.from({ length: 30 }, (_, index) => ({
    date: `2026-04-${String(index + 1).padStart(2, "0")}`,
    value: 150_000 + index * 2_000,
  })),
};

const NEWS_FIXTURE = {
  provider: "fixture",
  results: [
    {
      title: "Treasury curve steepens as markets digest inflation data",
      url: "https://example.test/curve-steepens",
      domain: "example.test",
      country: "US",
      publishedAt: "2026-04-30T10:30:00Z",
    },
    {
      title: "European rates desks prepare for central bank decision",
      url: "https://example.test/euro-rates",
      domain: "example.test",
      country: "GB",
      publishedAt: "2026-04-30T12:45:00Z",
    },
  ],
};

const GDELT_NEWS_FIXTURE = {
  shape: "news",
  provider: "gdelt",
  source: "fixture",
  results: NEWS_FIXTURE.results,
  consensus: {
    averageTone: 0.72,
    latestTone: 1.18,
    positive: 5,
    neutral: 3,
    negative: 2,
    trend: "improving",
    timeline: [
      { date: "2026-04-30T08:00:00Z", value: -0.2 },
      { date: "2026-04-30T09:00:00Z", value: 0.4 },
      { date: "2026-04-30T10:00:00Z", value: 1.18 },
    ],
  },
};

function seriesFixture(symbol = "DGS10", range = "3m") {
  return {
    shape: "timeseries",
    symbol,
    label: symbol === "DGS2" ? "2Y Treasury" : "10Y Treasury",
    format: "percent",
    range,
    source: "fixture",
    results: Array.from({ length: 24 }, (_, index) => ({
      date: `2026-04-${String(index + 1).padStart(2, "0")}`,
      value: 3.9 + index * 0.015,
    })),
  };
}

function equityFixture(symbol = "AAPL", range = "1y") {
  return {
    shape: "timeseries",
    symbol,
    label: symbol,
    format: "level",
    range,
    source: "fixture",
    results: Array.from({ length: 24 }, (_, index) => ({
      date: `2026-04-${String(index + 1).padStart(2, "0")}`,
      value: 180 + index * 1.35,
    })),
  };
}

function fixtureForDataQuery(request: DataQueryRequest) {
  const moniker = request.moniker ?? "";
  const shape = request.shape;

  if (moniker === "macro.indicators" && shape === "snapshot") {
    return MACRO_SNAPSHOT;
  }
  if (
    (moniker === "macro.indicators" ||
      moniker.startsWith("macro.indicators/")) &&
    shape === "timeseries"
  ) {
    return seriesFixture(
      typeof request.params?.symbol === "string"
        ? request.params.symbol
        : (moniker.split("/")[1] ?? "DGS10"),
      typeof request.params?.range === "string" ? request.params.range : "3m",
    );
  }
  if (moniker.startsWith("fixed.income.govies") && shape === "curve") {
    return YIELD_CURVE;
  }
  if (moniker === "reference.rates" && shape === "snapshot") {
    return REFERENCE_RATES;
  }
  if (moniker.startsWith("equity.prices/") && shape === "timeseries") {
    const symbol = moniker.split("/")[1] ?? "AAPL";
    return equityFixture(
      symbol,
      typeof request.params?.range === "string" ? request.params.range : "1y",
    );
  }
  if (moniker === "portfolio.positions") {
    return PORTFOLIO_POSITIONS;
  }
  if (moniker === "portfolio.summary") {
    return PORTFOLIO_SUMMARY;
  }
  if (moniker === "portfolio.exposure") {
    return PORTFOLIO_EXPOSURE;
  }
  if (moniker.endsWith("/pnl-history")) {
    return POSITION_PNL;
  }
  if (moniker.startsWith("portfolio.position/")) {
    return POSITION_DETAIL;
  }
  if (moniker === "news/gdelt" && shape === "news") {
    return GDELT_NEWS_FIXTURE;
  }

  return { error: `No fixture for ${moniker}`, status: 404 };
}

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
    failedRequests.push(
      `${request.method()} ${request.url()} ${failure?.errorText ?? ""}`.trim(),
    );
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

export async function mockStableWidgetData(page: Page) {
  await page.route("**/api/news**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(NEWS_FIXTURE),
    });
  });

  await page.route("**/api/data/query", async (route) => {
    const request = route.request().postDataJSON() as DataQueryRequest;
    const body = fixtureForDataQuery(request);
    const status =
      "status" in body && typeof body.status === "number" ? body.status : 200;
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

export async function openCleanWorkbench(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.localStorage.removeItem("workbench-layout-v1");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("banner", { name: "Workspace toolbar" }),
  ).toBeVisible();
  await expect(page.locator(".workspace-grid")).toBeVisible();
}

export async function switchToScreen(page: Page, screenName: string) {
  const button = page
    .getByRole("banner", { name: "Workspace toolbar" })
    .getByRole("button", { name: screenName, exact: true });

  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}
