# Workbench

Plain React + standalone API scaffold for **WBN-020**: an OpenBB-Workspace-style trader dashboard with draggable widgets, charting, moniker-aware market data routes, and agent-memory-backed chat persistence.

## Architecture

- **Frontend:** React 19 + Vite
- **Backend:** Express + TypeScript
- **Package manager:** npm
- **Import alias:** `@/*` -> `src/*`

The workspace UI remains in the frontend. Market, news, and chat endpoints now live in a separate API service under `src/server`.

For the current local/Mac split, keep `docs/service-topology.md` as the source
of truth. It records the active Windows dev services, the Mac provider/cache
services, and the legacy VMware/K3s host.

## Data Plane Direction

The UI should hit one data-facing service for real datasets. Widgets should pass monikers and expected shapes, not provider names or cache details.

Current local development flow:

```text
React widgets
  -> Workbench API
  -> standalone Data Router
  -> Open Moniker route plan
  -> QuestDB / OpenBB / GDELT / provider adapters
  -> normalized dataset
```

Fallback development flow:

```text
React widgets
  -> Workbench API
  -> standalone Data Router
  -> local route-plan stubs
  -> QuestDB / OpenBB / GDELT / provider adapters
  -> normalized dataset
```

Open Moniker is the routing brain: it decides which source or ordered source list backs a moniker. The data router is intentionally dumb and horizontally scalable: it executes route plans, calls adapters with the route `ref` payload, normalizes responses, and returns datasets.

When `MONIKER_RESOLVER_URL` is set, `src/server/data-router/route-plan-resolver.ts` calls `GET <url>/route-plan?moniker=<path>&shape=<shape>`. Set `DATA_ROUTING_MODE=direct` or `MONIKER_ROUTING_MODE=direct` only when forcing local route-plan stubs. If Open Moniker has no plan for a current dev moniker, local stubs remain as a development fallback.

Detailed service ownership and host/port inventory lives in `docs/service-topology.md`.

## Getting started

Install dependencies:

```powershell
npm install
```

Run the frontend and API together:

```powershell
npm run dev
```

- App: [http://127.0.0.1:3000](http://127.0.0.1:3000)

The Vite dev server proxies `/api/*` and `/health` to the local backend on port `4000`, so the app is used from port `3000`. `npm run dev` also starts the standalone data-router service on port `4100`.

For a new environment, start from `.env.example` and set `OPENBB_BASE_URL` to an OpenBB-compatible API. The current market widgets require:

- `GET /api/v1/economy/fred_series?provider=fred&symbol=<FRED_SYMBOL>&limit=<N>`
- `GET /api/v1/fixedincome/government/yield_curve?provider=fred`
- `GET /api/v1/news/company?provider=yfinance&symbol=SPY,QQQ,AAPL,MSFT,NVDA&limit=<N>`

QuestDB, Ollama, and chat-memory services are optional. Without QuestDB, market routes use OpenBB directly. Without Ollama, the chat widget renders but sends return an API error. Without chat memory config, chat history persistence is disabled.

## Scripts

| Script                 | Purpose                                             |
| ---------------------- | --------------------------------------------------- |
| `npm run dev`          | Run the Vite frontend and API server together       |
| `npm run build`        | Build both the frontend assets and API output       |
| `npm run start`        | Start the built API plus Vite preview               |
| `npm run lint`         | Run ESLint across app, server, and Playwright files |
| `npm run typecheck`    | Type-check frontend and backend TS configs          |
| `npm run format:check` | Check formatting                                    |
| `npm run test:unit`    | Run Vitest unit tests                               |
| `npm run test:api`     | Run Playwright API contract tests                   |
| `npm run test:e2e`     | Run Playwright end-to-end workflow tests            |
| `npm run test:visual`  | Run Playwright visual regression tests              |
| `npm run test:perf`    | Run Playwright browser/API performance checks       |
| `npm run test:regression` | Run the full Playwright regression suite         |

See `docs/testing.md` for the visual baseline update workflow, performance
budgets, and failure artifact locations.

## Environment

The frontend reads `VITE_API_BASE_URL` and defaults to same-origin `/api/*` requests.
Set `VITE_MEMORY_API_BASE_URL` and `VITE_MEMORY_USER_ID` only if the chat widget should persist history to an external memory service; without them, chat still calls the API but history persistence is disabled.

The API service uses:

- `PORT` - API port (default `4000`)
- `DATA_ROUTER_PORT` - standalone data-router port (default `4100`)
- `DATA_ROUTER_URL` - data-router URL used by the Workbench API; use `embedded` only for local fallback
- `FRONTEND_ORIGIN` - optional comma-separated CORS allowlist
- `OPENBB_BASE_URL` - OpenBB-compatible API base URL for market data and preferred news
- `QUESTDB_URL` - optional QuestDB HTTP endpoint for cache-first market data
- `DATA_ROUTING_MODE` - optional data routing mode; set `direct` to force local stubs
- `MONIKER_ROUTING_MODE` - optional alias for `DATA_ROUTING_MODE`
- `MONIKER_RESOLVER_URL` - optional Open Moniker route-plan resolver URL; when set, route plans use Open Moniker first
- `OLLAMA_BASE_URL` - optional Ollama endpoint for `/api/chat`
- `OLLAMA_MODEL` - optional Ollama model name for `/api/chat`

## Notes

- The WBN-019 moniker contract is preserved: unmapped monikers return `"data unavailable"` with no silent provider fallback.
- Okta and deployment-specific manifests remain deferred to later tickets.
