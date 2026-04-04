# StreamBridge

A multi-tenant Stremio addon platform. Users sign up, add their IPTV provider credentials (Xtream Codes), and get a unique personalized Stremio addon URL that serves their VOD catalog with automatic host failover and TMDB metadata matching.

## Architecture

See [ADR.md](./ADR.md) for full architecture decision record.

```
/
├── backend/          Node.js + Express + PostgreSQL
│   └── src/
│       ├── addon/    Stremio addon protocol handlers
│       ├── api/      REST API routes (auth, user, providers)
│       ├── admin/    Admin API routes
│       ├── jobs/     Background cron jobs
│       ├── services/ Business logic
│       ├── db/       Schema, migrations, queries
│       └── middleware/
└── frontend/         React + Tailwind CSS
    └── src/
        ├── pages/    User dashboard (6 pages)
        ├── admin/    Admin dashboard (6 pages)
        ├── components/
        ├── context/
        └── utils/
```

## Quick Start (Local)

### Prerequisites
- Node.js 18+
- PostgreSQL 14+ (or Docker)
- TMDB API key (free at themoviedb.org)

### With Docker Compose

```bash
# Copy env file
cp backend/.env.example backend/.env
# Edit backend/.env with your TMDB API key and secrets

# Start everything
docker compose up -d --build

# Run migrations (first time only)
docker exec streambridge_backend npm run migrate
```

App will be at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Admin panel: http://localhost:3000/admin/login

The Docker frontend runs as a production build served by Nginx. If you change
`VITE_API_URL`, rebuild the frontend image with `docker compose up -d --build`.

### Without Docker

```bash
# 1. Set up PostgreSQL database named 'streambridge'

# 2. Backend
cd backend
cp .env.example .env   # Edit with your values
npm install
npm run migrate        # Apply schema
npm run dev            # Start backend on :3001

# 3. Frontend (new terminal)
cd frontend
npm install
VITE_API_URL=http://localhost:3001 npm start  # Starts on :3000
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `TMDB_API_KEY` | TMDB API key (optional but improves match quality) |
| `ADMIN_USERNAME` | Admin panel username |
| `ADMIN_PASSWORD` | Admin panel password |
| `JWT_SECRET` | Random secret for JWT signing |
| `PORT` | Backend port (default: 3001) |
| `BASE_URL` | Public URL of the backend (for addon URLs) |
| `FRONTEND_URL` | Frontend origin (for CORS) |

## Deploy to Railway

1. Create a new Railway project
2. Add a PostgreSQL plugin
3. Deploy the backend service with the `/backend` root directory
4. Deploy the frontend service with the `/frontend` root directory
5. Set all environment variables in Railway dashboard
6. Run `npm run migrate` in the backend service shell

## Deploy to Kubernetes / K3s

Kubernetes deployment assets now live under [deployment/README.md](./deployment/README.md).

The included Helm chart covers:

- frontend Deployment + Service
- backend Deployment + Service
- optional scheduler Deployment for cron jobs
- optional in-cluster PostgreSQL
- optional Ingress routing for `/`, `/api`, `/admin`, `/addon`, and `/health`

Basic install:

```bash
helm upgrade --install streambridge ./deployment/helm/streambridge \
  --namespace streambridge \
  --create-namespace \
  -f your-values.yaml
```

For K3s, there is also a starter profile at [deployment/helm/streambridge/values.k3s.yaml](/Users/kush-mac/Documents/Claude/Projects/streamio/deployment/helm/streambridge/values.k3s.yaml).

## Addon URL Format

Each user gets a unique URL:
```
https://your-app.railway.app/addon/{token}/manifest.json
```

## Background Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| Health Check | Every 5 min | Pings all provider hosts, sets best active host |
| TMDB Sync | Daily 2 AM | Downloads TMDB export files |
| Catalog Refresh | Daily 4 AM | Re-fetches VOD from all providers |
| Matching | Daily 5 AM | Matches unmatched titles against TMDB |

All jobs can be triggered manually from the Admin → System panel.

## How Matching Works

1. Raw title from IPTV provider: `"The Matrix (1999) Hindi Dubbed 1080p"`
2. Cleaned by stripping language tags, quality tags, year: `"The Matrix"`
3. PostgreSQL trigram similarity query against `tmdb_movies`
4. Score > 0.6 → stored in `matched_content` with TMDB ID
5. Unmatched content still shows in Stremio with provider poster/title as fallback
6. Match cache is global — if another user has the same raw title, result is reused
