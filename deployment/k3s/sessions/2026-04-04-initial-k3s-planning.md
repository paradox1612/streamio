# Session: Initial K3s Planning

Date: 2026-04-04

## Goal

Prepare StreamBridge for deployment to a home-lab K3s cluster and establish persistent documentation for K3s-related work.

## What Was Found

- A Helm chart already exists at `deployment/helm/streambridge`.
- A K3s starter values file already exists at `deployment/helm/streambridge/values.k3s.yaml`.
- A homelab values file now exists at `deployment/helm/streambridge/values.homelab.yaml`.
- The local Kubernetes context currently points to `kind-argocd`, not a K3s cluster.
- `helm` is not installed in the current shell `PATH`, but a usable binary exists at `~/Desktop/k3s/bin/helm`.
- The real K3s kubeconfig uses context `default`.
- The cluster has multiple nodes on the `192.168.1.x` LAN.
- User reports the cluster uses NGINX ingress, not Traefik.
- User reports Cloudflare components are running in-cluster.
- Chosen hostname: `stream.example.com`
- The repo working tree was clean during this session.

## Actions Taken

- Created a repo-local K3s operations folder.
- Added a current status document.
- Added a deployment checklist.
- Added a homelab values file for no-public-DNS and no-registry deployment.
- Resolved the active K3s context from `KUBECONFIG=/Users/kush-mac/.kube/config-k3s`.
- Retrieved the TMDB API key from local `backend/.env`.
- Generated a JWT secret and a PostgreSQL password.
- Wrote a deployment-ready values file to `~/Desktop/k3s/artifacts/streambridge-values.example.yaml`.
- Added a GitHub Actions workflow to build and publish backend and frontend images to GHCR.
- Recorded this initial session.

## Deployment Status

- Not deployed from this environment.
- Awaiting real K3s context, Helm path setup, registry details, and final secrets.

## Recommended Next Session

- Connect to the actual home-lab K3s context.
- Confirm the K3s node LAN IP.
- Build and import the homelab images.
- Fill the homelab values file for the cluster.
- Run the first Helm deployment and capture outputs.
