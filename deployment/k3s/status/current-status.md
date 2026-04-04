# Current K3s Status

Last updated: 2026-04-04

## Summary

- StreamBridge has a Helm chart suitable as a base for K3s deployment.
- The repository already includes a starter K3s values file at `deployment/helm/streambridge/values.k3s.yaml`.
- A LAN-only homelab values file now exists at `deployment/helm/streambridge/values.homelab.yaml`.
- A secret-bearing deployment values file has been staged outside the repo at `~/Desktop/k3s/artifacts/streambridge-values.thekush.dev.yaml`.
- Deployment has not been executed from this workspace yet.

## Known Facts

- Active local Kubernetes context: `kind-argocd`
- Intended target environment: home lab K3s
- `helm` in current shell `PATH`: not installed
- Usable Helm binary found at `~/Desktop/k3s/bin/helm`
- User reports ingress controller: NGINX
- User reports Cloudflare container/services exist in cluster
- Resolved K3s context via `KUBECONFIG=/Users/kush-mac/.kube/config-k3s`
- Target hostname: `streambridge.thekush.dev`
- GitHub Actions image publishing workflow added for GHCR
- Current repo state: clean working tree

## Readiness

- Helm chart present: yes
- K3s-focused values file present: yes
- Ingress model present: yes, Traefik-oriented
- Homelab ingress target: NGINX
- Scheduler deployment present: yes
- In-cluster PostgreSQL option present: yes
- Confirmed access to target K3s cluster from this shell: yes
- External image registry required: no
- Public DNS required: no
- Planned hostname: `streambridge.thekush.dev`
- Planned database model: in-cluster PostgreSQL

## Immediate Blockers

- Need either `helm` added to `PATH` or explicit use of `~/Desktop/k3s/bin/helm`.
- Need the GitHub Actions workflow to run successfully and publish images.
- Need to decide whether GHCR packages will be public or private.

## Next Actions

- Push the repository to GitHub and run the image build workflow.
- Confirm the published image tags to deploy.
- Run `helm upgrade --install` against the K3s cluster.
