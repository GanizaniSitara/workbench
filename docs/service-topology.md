# Workbench Service Topology

Last checked: 2026-05-03.

This document is the local source of truth for what runs where while the
Workbench, Open Moniker, and data-router contracts are still changing.

## Current Development Topology

Keep the fast-change control plane on the Windows development machine. Use the
Mac/infrastructure host for heavier provider and cache services.

```text
Browser / Workbench UX
  http://127.0.0.1:3000
        |
        v
Workbench API
  http://127.0.0.1:4000
        |
        | proxies /api/data/*
        v
Standalone Data Router
  http://127.0.0.1:4100
        |
        | route plans
        v
Open Moniker dev resolver
  http://127.0.0.1:8060

Data Router provider/cache calls:
  OpenBB  -> http://192.168.1.79:6900
  QuestDB -> http://192.168.1.79:9007

Notebook:
  Jupyter -> http://127.0.0.1:8888
```

## Observed Hosts

| Host | Role | Observed services | Current Workbench use |
| --- | --- | --- | --- |
| Windows dev machine | Fast-change app/control plane | Workbench UX `3000`, Workbench API `4000`, Data Router `4100`, Open Moniker dev `8060`, Jupyter `8888` | Primary development runtime |
| `192.168.1.79` | Mac / infrastructure host | OpenBB `6900`, QuestDB `9007`, HTTP/Knative-style app on `80`, nginx/auth surface on `8080`, SSH `22` | Provider/cache upstreams |
| `192.168.183.131` | VMware/Ubuntu K3s-era host | Moniker Service on `80`, Kubernetes API `6443`, SSH `22` | Legacy/parallel service, not the active Workbench resolver |

## Respawn Status

The Mac services are live but their process manager is not yet documented in
this repo. From the Windows machine, SSH to `192.168.1.79` currently rejects the
available credentials, so we cannot confirm whether OpenBB and QuestDB are
Docker containers, OrbStack/Kubernetes workloads, launchd services, or manually
started processes.

Treat these services as operationally loose until a Mac-side runbook or manifest
is added. The missing runbook should capture:

- exact service owner and repo, if any
- startup command or manifest path
- persistent data path for QuestDB
- health check
- stop/restart command
- whether the service should survive Mac reboot

The active `.env.local` pattern should be:

```env
DATA_ROUTER_URL=http://127.0.0.1:4100
MONIKER_RESOLVER_URL=http://127.0.0.1:8060
OPENBB_BASE_URL=http://192.168.1.79:6900
QUESTDB_URL=http://192.168.1.79:9007
JUPYTER_GATEWAY_URL=http://127.0.0.1:8888
```

## Ownership Rule

For now:

- Workbench UX/API, Data Router, Open Moniker, and Jupyter stay local on
  Windows for fast iteration.
- OpenBB and QuestDB stay on the Mac/infrastructure host because they are
  heavier provider/cache services and are not changing as quickly.
- The VMware/K3s Moniker service is not the active route-plan authority for
  Workbench unless `MONIKER_RESOLVER_URL` is deliberately pointed at it.

Later, when the route-plan and data-query contracts stabilize, move the
following together onto the Mac/OrbStack/Kubernetes side:

- Open Moniker
- Data Router
- provider proxies
- cache and historical stores
- ingest jobs

Jupyter should stay local until auth, session ownership, and kernel lifecycle
are explicit enough to run it safely in Kubernetes.

## Health Checks

Use these checks when the app looks confused:

```text
GET http://127.0.0.1:4000/ready
GET http://127.0.0.1:4100/ready
GET http://127.0.0.1:8060/health
GET http://192.168.1.79:6900
GET http://192.168.1.79:9007/exec?query=select%201
```

Route-plan source check:

```text
GET http://127.0.0.1:4100/api/data/route-plan?moniker=reference.rates%2FSONIA&shape=snapshot
```

For current core datasets the response should say:

```json
{
  "mode": "moniker-service",
  "routingMode": "moniker-service",
  "resolverUrl": "http://127.0.0.1:8060"
}
```

If it says `moniker-service-fallback`, Workbench asked Open Moniker first but
fell back to local route-plan stubs.
