# Workbench Test Framework

Workbench uses a layered test suite so API regressions, UI drift, browser
errors, and performance slowdowns are visible before they land.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run test:unit` | Fast Vitest coverage for pure client/server logic |
| `npm run test:api` | Playwright API contract checks against the running app |
| `npm run test:e2e` | Browser workflow tests for normal user interactions |
| `npm run test:visual` | Visual regression checks against approved screenshots |
| `npm run test:visual:update` | Refresh approved screenshots after reviewing intentional UI changes |
| `npm run test:perf` | Browser and API performance budget checks |
| `npm run test:regression` | Full Playwright API, E2E, visual, and performance suite |

## Visual Baselines

Visual tests live in `tests/e2e/visual-regression.spec.ts` and use Playwright
`toHaveScreenshot`. Baselines are project-specific, so changes in browser,
viewport, or OS rendering should be reviewed before updating.

Use this workflow for intentional visual changes:

1. Run `npm run test:visual`.
2. Inspect any generated diff artifacts under `test-results/playwright`.
3. Confirm the change is expected in the app.
4. Run `npm run test:visual:update`.
5. Review the changed snapshot files before committing.

Do not update snapshots just to make a failing test pass. The diff is the review
surface.

## Performance Budgets

Performance tests live in `tests/e2e/performance.spec.ts`. They attach JSON
timing artifacts for navigation, render, and critical API paths.

Default local budgets are intentionally generous for dev machines:

| Variable | Default |
| --- | --- |
| `WORKBENCH_PERF_BUDGET_NAV_MS` | `10000` |
| `WORKBENCH_PERF_BUDGET_RENDER_MS` | `12000` |
| `WORKBENCH_PERF_BUDGET_API_MS` | `2000` |
| `WORKBENCH_PERF_BUDGET_DATA_QUERY_MS` | `4000` |

Tighten these once CI has enough stable history.

## Failure Artifacts

Playwright writes traces, screenshots, videos, and attachments to
`test-results/playwright` on failure. API and performance specs attach JSON
payloads that are meant to be read directly during triage.

The browser helpers in `tests/e2e/helpers/workbench.ts` also catch console
errors, uncaught page errors, and failed browser requests so hidden breakages do
not pass silently.

## Local Port Isolation

Playwright starts Workbench through `scripts/dev-playwright.mjs` on isolated
ports by default:

| Variable | Default |
| --- | --- |
| `PLAYWRIGHT_PORT` | `3100` |
| `PLAYWRIGHT_API_PORT` | `4100` |

The normal developer ports remain unchanged: Vite on `3000`, API on `4000`.
