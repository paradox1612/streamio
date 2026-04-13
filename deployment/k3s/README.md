# StreamBridge K3s Operations

This folder tracks the K3s deployment work for StreamBridge.

## Purpose

- Keep the deployment runbook close to the service source.
- Record current K3s readiness and blockers.
- Preserve session history so future changes have context.

## Layout

```text
deployment/k3s/
├── README.md
├── status/
│   └── current-status.md
├── steps/
│   └── deployment-checklist.md
└── sessions/
    └── 2026-04-04-initial-k3s-planning.md
```

## Current Deployment Model

- Deploy with the Helm chart in `deployment/helm/streambridge`.
- Use `deployment/helm/streambridge/values.k3s.yaml` as the base values file.
- Build and push two images before install:
  - backend image
  - frontend image with the correct `PUBLIC_BASE_URL`-driven `NEXT_PUBLIC_*` build args
- Prefer an external PostgreSQL instance for long-term homelab durability, but the chart can run bundled PostgreSQL for a first deployment.

## Operational Rule

Any meaningful K3s work should update:

- `status/current-status.md`
- `sessions/<date>-<topic>.md`
