# Workbench Service Topology Template

Copy this file to `docs/service-topology.md` for local/operator notes. The
local file is ignored because it can contain machine names, LAN addresses, and
one-off service state.

## Current Development Topology

```text
Browser / Workbench UX
  http://localhost:3000
        |
        v
Workbench API
  http://localhost:4000
        |
        | proxies /api/data/*
        v
Standalone Data Router
  http://localhost:4100
        |
        | route plans
        v
Open Moniker dev resolver
  http://localhost:8060

Data Router provider/cache calls:
  OpenBB  -> http://<mac-infra-host>:6900
  QuestDB -> http://<mac-infra-host>:9007

Notebook:
  Jupyter -> http://localhost:8888
```

## Host Inventory

| Host | Role | Observed services | Current Workbench use |
| --- | --- | --- | --- |
| Windows dev machine | Fast-change app/control plane | Workbench UX `3000`, Workbench API `4000`, Data Router `4100`, Open Moniker dev `8060`, Jupyter `8888` | Primary development runtime |
| `<mac-infra-host>` | Mac / infrastructure host | OpenBB `6900`, QuestDB `9007`, HTTP/Knative-style app on `80`, nginx/auth surface on `8080`, SSH `22` | Provider/cache upstreams |
| `<legacy-k3s-host>` | VMware/Ubuntu K3s-era host | Moniker Service on `80`, Kubernetes API `6443`, SSH `22` | Legacy/parallel service, not the active Workbench resolver |

## Respawn Status

OpenBB and QuestDB/FRED cache were deployed from the Windows workstation onto
the Mac OrbStack/KEDA Kubernetes environment. Operational manifests live outside
this repo:

```text
<operator-scripts-root>\k3s-manifests\openbb\
<operator-scripts-root>\k3s-manifests\fred-cache\
```

Relevant task records:

- `WBN-011` - Deploy OpenBB Platform data provider on Mac OrbStack k8s
- `WBN-012` - FRED time-series cache on Mac k8s (QuestDB + KEDA fetcher)

OpenBB respawn/update path, run on the Mac with `kubectl` targeting OrbStack:

```bash
cd k3s-manifests/openbb
docker build -t openbb-platform:latest .
kubectl apply -f .
kubectl rollout restart deployment/openbb-platform -n openbb
kubectl get pods -n openbb
kubectl get svc openbb-platform -n openbb
```

QuestDB/FRED cache respawn/update path, run on the Mac with `kubectl` targeting
OrbStack:

```bash
cd k3s-manifests/fred-cache
docker build -t fred-fetcher:latest ./30-fetcher-image/
kubectl apply -f .
kubectl wait --for=condition=Ready pod -l app=questdb -n fred-cache --timeout=120s
kubectl scale deployment/fred-fetcher -n fred-cache --replicas=1
kubectl logs -f deployment/fred-fetcher -n fred-cache
kubectl scale deployment/fred-fetcher -n fred-cache --replicas=0
```

## Local Environment Pattern

```env
DATA_ROUTER_URL=http://localhost:4100
MONIKER_RESOLVER_URL=http://localhost:8060
OPENBB_BASE_URL=http://<mac-infra-host>:6900
QUESTDB_URL=http://<mac-infra-host>:9007
JUPYTER_GATEWAY_URL=http://localhost:8888
```

## Ownership Rule

For now:

- Workbench UX/API, Data Router, Open Moniker, and Jupyter stay local on
  Windows for fast iteration.
- OpenBB and QuestDB stay on the Mac/infrastructure host because they are
  heavier provider/cache services and are not changing as quickly.
- The legacy K3s Moniker service is not the active route-plan authority for
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

```text
GET http://localhost:4000/ready
GET http://localhost:4100/ready
GET http://localhost:8060/health
GET http://<mac-infra-host>:6900
GET http://<mac-infra-host>:9007/exec?query=select%201
```

Route-plan source check:

```text
GET http://localhost:4100/api/data/route-plan?moniker=reference.rates%2FSONIA&shape=snapshot
```
