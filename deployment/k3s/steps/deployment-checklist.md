# K3s Deployment Checklist

## 1. Cluster Access

- Confirm the target K3s cluster context:
  - `kubectl config get-contexts`
  - `kubectl config use-context <k3s-context>`
- Verify node access:
  - `kubectl get nodes -o wide`
- Verify Traefik is present:
  - skip if your cluster uses NGINX Ingress instead
- Verify NGINX ingress is present:
  - `kubectl get pods -A | grep -i nginx`

## 2. Tooling

- Install `kubectl` on the operator machine if needed.
- Install `helm` v3 on the operator machine.
- Confirm both commands work before deployment.

## 3. Registry Strategy

- GitHub Actions will build and publish images to GHCR.
- Default repositories:
  - `ghcr.io/paradox1612/streambridge-backend`
  - `ghcr.io/paradox1612/streambridge-frontend`
- If the GHCR packages are private, create a pull secret and set `imagePullSecrets`.
- If the GHCR packages are public, no pull secret is needed.

## 4. Image Build

- Commit and push the workflow at `.github/workflows/build-images.yml`.
- In GitHub repository settings, add repository variable `PUBLIC_BASE_URL`:
  - `https://stream.example.com`
- Run the workflow manually or push to `main`.
- Confirm the images exist in GHCR before deployment.

Example expected tags:

```text
ghcr.io/paradox1612/streambridge-backend:latest
ghcr.io/paradox1612/streambridge-backend:sha-<short-sha>
ghcr.io/paradox1612/streambridge-frontend:latest
ghcr.io/paradox1612/streambridge-frontend:sha-<short-sha>
```

## 5. Values File

- Start from `deployment/helm/streambridge/values.homelab.yaml`.
- Set:
  - `imagePullSecrets` if GHCR is private
  - `frontend.image.repository`
  - `frontend.image.tag`
  - `backend.image.repository`
  - `backend.image.tag`
  - `backend.env.frontendUrl`
  - `backend.env.baseUrl`
  - `backend.secrets.tmdbApiKey`
  - `backend.secrets.adminPassword`
  - `backend.secrets.jwtSecret`
  - either `backend.secrets.databaseUrl` or bundled `postgres.*`
  - `ingress.host`

- Chosen hostname:

```text
stream.example.com
```

## 6. Database Choice

- Bundled PostgreSQL is the chosen plan.
- Keep `postgres.enabled=true`.
- Set a strong password.
- Keep persistent storage on `local-path`.
- Ensure the K3s node has enough disk space for the PVC.

## 7. Namespace Prep

```bash
kubectl create namespace streambridge --dry-run=client -o yaml | kubectl apply -f -
```

## 8. Deploy

```bash
~/Desktop/k3s/bin/helm upgrade --install streambridge ./deployment/helm/streambridge \
  --namespace streambridge \
  --create-namespace \
  -f /path/to/streambridge-values.yaml
```

## 9. Verify

- Check workload state:

```bash
kubectl get pods -n streambridge
kubectl get svc -n streambridge
kubectl get ingress -n streambridge
```

- Inspect logs if anything restarts:

```bash
kubectl logs deploy/streambridge-streambridge-backend -n streambridge --tail=200
kubectl logs deploy/streambridge-streambridge-frontend -n streambridge --tail=200
kubectl logs deploy/streambridge-scheduler -n streambridge --tail=200
```

- Test health:

```bash
  curl -I https://stream.example.com/health
  curl -I https://stream.example.com/
```

## 10. Post-Deploy

- Create first admin login and verify access.
- Add a test provider account.
- Open the generated addon manifest URL and confirm it resolves.
- Record all final values, hostname, and outcomes in the status and session files.
