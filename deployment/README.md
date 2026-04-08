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
- pre-install/pre-upgrade `migrations` Job using the backend image
- optional `scheduler` Deployment using the backend image
- optional `postgres` StatefulSet + Service + PVC
- optional Ingress for a single public host
- Secret for backend environment variables

## K3s Notes

- The base chart defaults `ingress.className` to `traefik`, but homelab clusters can override this to `nginx`.
- K3s usually provides the `local-path` storage class, which works for the bundled Postgres PVC.
- For production, an external managed Postgres is safer than an in-cluster single-replica database.
- The chart runs cron jobs in a separate scheduler pod, while web pods use `APP_ROLE=web`.
- Database schema migrations run in a dedicated Helm hook Job so web pods do not block on large schema backfills during startup.
- Scheduled jobs also use PostgreSQL advisory locks, so duplicate scheduler instances will skip a job instead of double-running it.
- Ongoing K3s planning and session notes live in `deployment/k3s/`.
- For a LAN-only homelab without public DNS, use a host like `streambridge.<node-ip>.nip.io` and disable TLS until you add local DNS or certificates.
- For a homelab without an external image registry, use `imagePullPolicy: IfNotPresent` and import the built images into the K3s node container runtime.
- If your cluster uses NGINX Ingress instead of Traefik, set `ingress.className=nginx`.
- GitHub Actions can publish backend and frontend images to GHCR via `.github/workflows/build-images.yml`.
- The same workflow can also deploy to a local K3s cluster by running a follow-up job on a self-hosted GitHub runner labeled `k3s`.

## Quick Start

1. Copy the chart values and edit them:

```bash
cp deployment/helm/streambridge/values.yaml /tmp/streambridge-values.yaml
```

For K3s, you can start from the tuned profile:

```bash
cp deployment/helm/streambridge/values.k3s.yaml /tmp/streambridge-values.yaml
```

For a LAN-only homelab, you can also start from:

```bash
cp deployment/helm/streambridge/values.homelab.yaml /tmp/streambridge-values.yaml
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

The frontend image must be rebuilt whenever the public API URL changes because Vite injects `VITE_API_URL` at build time.

For a homelab with no external registry, a common workflow is:

```bash
docker build -t streambridge-backend:homelab ./backend
docker build \
  -t streambridge-frontend:homelab \
  --build-arg VITE_API_URL=http://streambridge.<node-ip>.nip.io \
  ./frontend

docker save streambridge-backend:homelab | ssh <k3s-node> "sudo k3s ctr images import -"
docker save streambridge-frontend:homelab | ssh <k3s-node> "sudo k3s ctr images import -"
```

For a GitHub-driven workflow, push to `main` or run the workflow manually to publish:

- `ghcr.io/paradox1612/streambridge-backend`
- `ghcr.io/paradox1612/streambridge-frontend`

The frontend build reads `VITE_API_URL` from the GitHub Actions repository variable `VITE_API_URL`. If that variable is not set, it defaults to `https://streambridge.thekush.dev`.

### Self-Hosted K3s Deploy Runner

If you want GitHub to trigger the K3s deploy automatically after the image build:

1. Install a self-hosted GitHub Actions runner on the machine that already has access to your K3s cluster.
2. Give that runner the `k3s` label.
3. Ensure the runner machine has:
   - `kubectl` on `PATH`
   - Helm available at the configured path
   - a readable kubeconfig for the target cluster
   - the secret-bearing values file staged locally outside the repo
4. Configure these optional repository variables if your local paths differ:
   - `K3S_KUBECONFIG_PATH`
   - `K3S_HELM_BIN`
   - `K3S_VALUES_FILE`
   - `K3S_RELEASE_NAME`
   - `K3S_NAMESPACE`

The workflow deploys the exact image tags built for the current commit using the `sha-<short-commit>` tag, rather than relying on `latest`.

If GHCR packages remain private, create a Kubernetes image pull secret and set `imagePullSecrets` in your Helm values.

## Ingress Routing

When ingress is enabled, the chart routes these paths to the backend service:

- `/api`
- `/admin`
- `/addon`
- `/health`

Everything else goes to the frontend service.
