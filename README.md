# Workbench

Plain React + standalone API scaffold for **WBN-020**: an OpenBB-Workspace-style trader dashboard with draggable widgets, charting, moniker-aware market data routes, and agent-memory-backed chat persistence.

## Architecture

- **Frontend:** React 19 + Vite
- **Backend:** Express + TypeScript
- **Package manager:** Bun
- **Import alias:** `@/*` -> `src/*`

The workspace UI remains in the frontend. Market, news, and chat endpoints now live in a separate API service under `src/server`.

## Data Plane Direction

The UI should hit one data-facing service for real datasets. Widgets should pass monikers and expected shapes, not provider names or cache details.

Target flow:

```text
React widgets
  -> Workbench Data API
  -> Open Moniker route plan
  -> generic data router
  -> QuestDB / OpenBB / Refinitiv / direct DB adapters
  -> normalized dataset
```

Open Moniker is the routing brain: it decides which source or ordered source list backs a moniker. The data router is intentionally dumb and horizontally scalable: it executes route plans, calls adapters, normalizes responses, and returns datasets.

Until live Open Moniker route-plan reads are wired in, `src/server/data-router/route-plan-resolver.ts` exposes an explicit route-plan stub for current market datasets. That stub owns provider order, cache preference, and ordered fallback policy; market routes stay thin and source-agnostic apart from adapter registration.

Detailed data-plane planning notes are kept outside this public repository.

## Getting started

Install dependencies:

```powershell
bun install
```

Run the frontend and API together:

```powershell
bun run dev
```

- App: [http://127.0.0.1:3000](http://127.0.0.1:3000)

The Vite dev server proxies `/api/*` and `/health` to the local backend on port `4000`, so the app is used from port `3000`.

## Scripts

| Script                 | Purpose                                             |
| ---------------------- | --------------------------------------------------- |
| `bun run dev`          | Run the Vite frontend and API server together       |
| `bun run build`        | Build both the frontend bundle and API output       |
| `bun run start`        | Start the built API plus Vite preview               |
| `bun run lint`         | Run ESLint across app, server, and Playwright files |
| `bun run typecheck`    | Type-check frontend and backend TS configs          |
| `bun run format:check` | Check formatting                                    |
| `bun run test:e2e`     | Run Playwright end-to-end tests                     |

## Environment

The frontend reads `VITE_API_BASE_URL` and defaults to same-origin `/api/*` requests.

The API service uses:

- `PORT` - API port (default `4000`)
- `FRONTEND_ORIGIN` - optional comma-separated CORS allowlist
- `OPENBB_BASE_URL`
- `QUESTDB_URL`
- `MONIKER_RESOLVER_URL`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`

## Notes

- The WBN-019 moniker contract is preserved: unmapped monikers return `"data unavailable"` with no silent provider fallback.
- Okta and deployment-specific manifests remain deferred to later tickets.
