# Deployment

This folder holds Kubernetes deployment assets for StreamBridge.

## Layout

```text
deployment/
└── helm/
    └── streambridge/
        ├── Chart.yaml
        ├── values.yaml
        └── templates/
```

## What The Helm Chart Deploys

- `frontend` Deployment + Service
- `backend` Deployment + Service
- optional `scheduler` Deployment using the backend image
- optional `postgres` StatefulSet + Service + PVC
- optional Ingress for a single public host
- Secret for backend environment variables

## K3s Notes

- K3s ships with Traefik by default, so the chart defaults `ingress.className` to `traefik`.
- K3s usually provides the `local-path` storage class, which works for the bundled Postgres PVC.
- For production, an external managed Postgres is safer than an in-cluster single-replica database.
- The chart runs cron jobs in a separate scheduler pod, while web pods use `APP_ROLE=web`.
- Scheduled jobs also use PostgreSQL advisory locks, so duplicate scheduler instances will skip a job instead of double-running it.

## Quick Start

1. Copy the chart values and edit them:

```bash
cp deployment/helm/streambridge/values.yaml /tmp/streambridge-values.yaml
```

For K3s, you can start from the tuned profile:

```bash
cp deployment/helm/streambridge/values.k3s.yaml /tmp/streambridge-values.yaml
```

2. Set at minimum:

- `ingress.host`
- `backend.secrets.jwtSecret`
- `backend.secrets.adminPassword`
- `backend.secrets.tmdbApiKey`
- either external database settings or `postgres.enabled=true`

3. Install or upgrade:

```bash
helm upgrade --install streambridge ./deployment/helm/streambridge \
  --namespace streambridge \
  --create-namespace \
  -f /tmp/streambridge-values.yaml
```

## Images

The chart expects prebuilt container images.

- `backend.image.repository`
- `frontend.image.repository`
- `deployment/helm/streambridge/values.k3s.yaml` assumes Traefik, `local-path`, and cert-manager with a `letsencrypt-prod` ClusterIssuer.

The frontend image must be built with the correct `VITE_API_URL` because the current frontend uses a build-time API URL.

Example:

```bash
docker build \
  -t ghcr.io/your-org/streambridge-frontend:latest \
  --build-arg VITE_API_URL=https://stream.example.com \
  ./frontend
```

## Ingress Routing

When ingress is enabled, the chart routes these paths to the backend service:

- `/api`
- `/admin`
- `/addon`
- `/health`

Everything else goes to the frontend service.
