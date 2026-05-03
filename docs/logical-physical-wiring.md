# Workbench Wiring: Logical and Physical

This is the short map of how the Workbench stack fits together. Keep concrete
hostnames, LAN IPs, and one-off operator state in the ignored local file
`docs/service-topology.md`.

## Logical Wiring

```text
User / analyst
  -> Workbench UX
  -> Workbench API
  -> Data Router
  -> Open Moniker route plan
  -> provider/cache adapters
  -> normalized dataset
```

Responsibilities:

| Layer | Owns | Does not own |
| --- | --- | --- |
| Workbench UX | Screens, widgets, drag/drop monikers, notebook embedding | Provider selection |
| Workbench API | HTTP facade, auth/session later, proxy to data router, Jupyter bridge | Dataset identity |
| Data Router | Executes route plans, cache-first/provider-fallback behavior, normalization | Catalog semantics |
| Open Moniker | Moniker catalog, governance metadata, route-plan definitions | Fetching data |
| Providers/cache | OpenBB, GDELT, QuestDB, future vendor APIs | Workbench UX semantics |
| Jupyter | Analyst scratch/runtime surface | Canonical data routing |

Canonical query shape:

```text
wbn.query("equity.prices/AAPL")
wbn.query("reference.rates/SONIA")
wbn.query("macro.indicators/DGS10")
wbn.query("fixed.income.govies")
wbn.query("news/gdelt")
```

Parent monikers such as `equity.prices` and `reference.rates` are catalog
families/selectors. Concrete child monikers such as `equity.prices/AAPL` and
`reference.rates/SONIA` are executable datasets.

## Physical Wiring

Current development shape:

```text
Windows development machine
  Workbench UX
  Workbench API
  Data Router
  Open Moniker dev resolver
  Jupyter

Mac / OrbStack / KEDA infrastructure
  OpenBB provider API
  QuestDB cache
  FRED fetcher / ingest jobs

Legacy K3s/VM host
  Older Moniker deployment
  Kubernetes API
```

The Workbench `.env.local` decides which physical services are used:

```env
DATA_ROUTER_URL=http://localhost:<data-router-port>
MONIKER_RESOLVER_URL=http://localhost:<open-moniker-port>
OPENBB_BASE_URL=http://<mac-infra-host>:<openbb-port>
QUESTDB_URL=http://<mac-infra-host>:<questdb-port>
JUPYTER_GATEWAY_URL=http://localhost:<jupyter-port>
```

The intended short-term rule is:

- Keep fast-changing control-plane pieces local: Workbench, Data Router, Open
  Moniker dev resolver, and Jupyter.
- Keep heavier provider/cache pieces on the Mac infrastructure host: OpenBB,
  QuestDB, and ingest jobs.
- Do not point Workbench at the legacy K3s Moniker service unless deliberately
  testing that path.

The intended later rule is:

- Move Open Moniker, Data Router, provider proxies, cache, and ingest jobs
  together into Mac/OrbStack/Kubernetes once the data contract stabilizes.
- Move Jupyter only after auth, session ownership, and kernel lifecycle are
  explicitly designed.

## Repo Ownership

| Repo/path | Owns |
| --- | --- |
| `C:\git\workbench` | UX, widgets, Workbench API, standalone Data Router, adapters, Jupyter bridge, generic docs |
| `C:\git\open-moniker-svc` | Open Moniker API, catalog YAML, route-plan generation, governance metadata |
| `<operator-scripts-root>\k3s-manifests\openbb` | Mac OpenBB Kubernetes deployment/runbook |
| `<operator-scripts-root>\k3s-manifests\fred-cache` | Mac QuestDB + KEDA FRED fetcher deployment/runbook |

If a fact is about **what a dataset means or how it routes**, it belongs in Open
Moniker. If a fact is about **how Workbench renders or calls data**, it belongs
in Workbench. If a fact is about **which local machine or LAN address is used**,
it belongs in ignored local operator notes.

## Quick Checks

```text
GET /ready on Workbench API
GET /ready on Data Router
GET /health on Open Moniker
GET /exec?query=select%201 on QuestDB
GET /api/data/route-plan?moniker=reference.rates%2FSONIA&shape=snapshot
```

For core datasets, the route-plan diagnostic should report
`mode: "moniker-service"`. `moniker-service-fallback` means Workbench asked Open
Moniker first, then used local stubs because no live plan was available.
