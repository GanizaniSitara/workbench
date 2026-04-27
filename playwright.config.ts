import { defineConfig, devices } from "@playwright/test";

const bunCommand =
  process.platform === "win32"
    ? "C:\\Users\\admin\\.bun\\bin\\bun.exe run dev"
    : "bun run dev";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 7_500,
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: bunCommand,
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 90_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
