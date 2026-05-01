import { defineConfig, devices } from "@playwright/test";

const playwrightPort = process.env.PLAYWRIGHT_PORT ?? "3100";

export default defineConfig({
  testDir: "./tests/e2e",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    [
      "./scripts/dense-playwright-reporter.mjs",
      {
        outputFile: "playwright-report/dense.html",
        historyFile: ".test-history/playwright-runs.json",
        historyLimit: 80,
      },
    ],
  ],
  timeout: 30_000,
  expect: {
    timeout: 7_500,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.01,
      threshold: 0.2,
    },
  },
  outputDir: "test-results/playwright",
  use: {
    baseURL: `http://127.0.0.1:${playwrightPort}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/dev-playwright.mjs",
    url: `http://127.0.0.1:${playwrightPort}`,
    reuseExistingServer: true,
    timeout: 90_000,
  },
  projects: [
    {
      name: "api-contract",
      testMatch: /api-contract\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "e2e-chromium",
      testIgnore: [
        /api-contract\.spec\.ts/,
        /visual-regression\.spec\.ts/,
        /performance\.spec\.ts/,
      ],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "visual-desktop",
      testMatch: /visual-regression\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        colorScheme: "light",
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "performance",
      testMatch: /performance\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
