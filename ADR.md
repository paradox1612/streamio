# ADR-001: StreamBridge — Personalized Stremio Addon Platform

**Status:** Accepted
**Date:** 2026-03-24
**Deciders:** Engineering Team

---

## Context

We need to build a multi-tenant Stremio addon platform where each user gets a unique, personalized addon URL backed by their own IPTV provider credentials (Xtream Codes). The system must handle:

- Dynamic per-user catalog generation
- Automatic host failover across multiple IPTV hosts
- TMDB metadata enrichment via fuzzy title matching
- High read throughput on addon endpoints (Stremio polls frequently)
- A shared global match cache to avoid redundant TMDB lookups

The reference model is Torrentio — a stateless URL-per-user approach where the URL encodes configuration, except here the config lives server-side and is referenced by an opaque token.

---

## Decision

Build a monorepo with a Node.js/Express backend and React/Tailwind frontend, PostgreSQL as the single source of truth, and the `stremio-addon-sdk` for addon protocol compliance.

### Architecture Overview

```
Browser (React SPA)
        │
        ▼
  Express REST API  ◄──── JWT Auth ────► User Sessions
        │
        ├── /api/*         → User-facing REST (providers, catalog, profile)
        ├── /admin/*       → Admin REST (separate credential check)
        └── /addon/:token/* → Stremio addon protocol (public, token-gated)
                │
                ▼
         PostgreSQL
    ┌────────────────────────────────┐
    │  users          user_providers │
    │  user_provider_vod             │
    │  matched_content  (global)     │
    │  tmdb_movies / tmdb_series     │
    │  host_health                   │
    │  admin_users                   │
    └────────────────────────────────┘
                │
      Background Jobs (node-cron)
    ┌──────────────────────────────┐
    │  healthCheckJob   (*/5 min)  │
    │  tmdbSyncJob      (2 AM)     │
    │  catalogRefreshJob (4 AM)    │
    │  matchingJob       (5 AM)    │
    └──────────────────────────────┘
```

---

## Options Considered

### Option A: Token-in-URL (Chosen)

Each user gets a UUID `addon_token` stored in the DB. Addon URLs look like:
```
https://app.streambridge.io/addon/{token}/manifest.json
```

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — token lookup is a single DB query |
| Security | Medium — token is an opaque UUID; revocable by regenerating |
| Scalability | High — stateless per request, no session affinity needed |
| Stremio compat | Full — standard addon URL pattern |

**Pros:** Simple, revocable, no credentials in URL
**Cons:** Token theft = catalog exposure (mitigated by regeneration)

### Option B: Credentials-in-URL (Torrentio style)

Encode provider credentials directly in the addon URL path/query string.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low server-side, High key management |
| Security | Low — credentials exposed in URL, logs, referrer headers |
| Scalability | High — fully stateless |
| Stremio compat | Full |

**Pros:** No DB needed for addon route
**Cons:** Credentials in plaintext URL; no way to revoke without re-adding to Stremio

### Option C: Separate Addon Microservice

Spin up a dedicated addon service separate from the REST API.

| Dimension | Assessment |
|-----------|------------|
| Complexity | High — separate deployment, inter-service calls |
| Cost | Higher — two services to run |
| Scalability | High — can scale independently |
| Maintenance | High |

**Pros:** Independent scaling of addon vs API traffic
**Cons:** Operational overhead far exceeds current scale needs

---

## Trade-off Analysis

**Option A vs B:** The token-in-URL approach gives us server-side control (suspend users, revoke tokens, audit access) without putting credentials in URLs. The cost is one DB lookup per Stremio request — negligible with a connection pool and indexed token column.

**Monolith vs Microservices:** At launch scale (hundreds to low thousands of users), a single Express process with background jobs is far simpler to deploy and debug. Railway.app makes single-service deployment trivial. We can extract services later if specific bottlenecks emerge.

**PostgreSQL trigram matching vs external search:** pg_trgm gives us fuzzy matching inside the same DB transaction, avoiding an Elasticsearch/Algolia dependency. The TMDB dataset is ~1M rows; with a GIN index, similarity queries run in milliseconds.

---

## Consequences

**Becomes easier:**
- Token revocation / user suspension (flip `is_active`, done)
- Audit logging (all addon requests are token-keyed)
- TMDB match cache shared globally — one match benefits all users with the same raw title

**Becomes harder:**
- Horizontal scaling of background jobs (must ensure only one instance runs crons — use a job lock table or single worker dyno)
- High addon request throughput at scale (mitigate with catalog caching in Redis later)

**Will need to revisit:**
- Job deduplication if multiple instances deploy (add advisory locks or BullMQ)
- Catalog caching layer if addon endpoints become a bottleneck
- Rate limiting on Stremio addon routes

---

## Action Items

1. [x] Define DB schema with trigram indexes
2. [x] Scaffold monorepo: `/backend`, `/frontend`
3. [ ] Implement Auth service with JWT + token generation
4. [ ] Implement Provider service + Xtream Codes API client
5. [ ] Implement Host Health checker with node-cron
6. [ ] Implement TMDB daily export sync + trigram matching pipeline
7. [ ] Implement Stremio addon handlers (manifest, catalog, stream, meta)
8. [ ] Build React user dashboard (6 pages)
9. [ ] Build React admin dashboard (7 pages)
10. [ ] Write docker-compose for local dev
11. [ ] Deploy to Railway.app
