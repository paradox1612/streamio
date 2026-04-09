# StreamBridge — Marketplace & Twenty CRM Integration Plan

> **Goal:** Let customers purchase IPTV provider subscriptions directly from their dashboard, and manage every customer relationship, subscription lifecycle, and support interaction inside a self-hosted Twenty CRM instance — all running within our existing infrastructure.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Infrastructure — Self-Hosting Twenty CRM](#2-infrastructure--self-hosting-twenty-crm)
3. [Database Schema — Marketplace Tables](#3-database-schema--marketplace-tables)
4. [Stripe Billing Integration](#4-stripe-billing-integration)
5. [Marketplace Backend Routes](#5-marketplace-backend-routes)
6. [Twenty CRM — Data Model & Custom Objects](#6-twenty-crm--data-model--custom-objects)
7. [CRM Sync Pipeline](#7-crm-sync-pipeline)
8. [Inbound Webhook from Twenty](#8-inbound-webhook-from-twenty)
9. [Admin UI — Marketplace & CRM Dashboard](#9-admin-ui--marketplace--crm-dashboard)
10. [Implementation Roadmap](#10-implementation-roadmap)
11. [Environment Variables Reference](#11-environment-variables-reference)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                   Customer Dashboard                      │
│  Browse Providers → Select Plan → Stripe Checkout        │
└────────────────────────┬─────────────────────────────────┘
                         │ purchase
                         ▼
┌──────────────────────────────────────────────────────────┐
│               StreamBridge Express Backend                │
│                                                          │
│  marketplaceRoutes.js   subscriptionService.js           │
│  stripeService.js       eventBus.js (EventEmitter)       │
│                                                          │
│  PostgreSQL ──► provider_offerings                       │
│                 provider_subscriptions                   │
│                 payment_transactions                     │
└────────────┬──────────────────────────┬──────────────────┘
             │ provision credentials    │ async CRM events
             ▼                         ▼
    user_providers table       ┌───────────────────┐
    (existing, unchanged)      │  Twenty CRM API   │
                               │  (self-hosted,    │
                               │   same cluster)   │
                               │                   │
                               │  People           │
                               │  Companies        │
                               │  Subscriptions    │
                               │  Tasks / Notes    │
                               └───────────────────┘
```

**Design principles:**
- **Async CRM sync** — CRM writes never block the purchase or provisioning flow. EventEmitter fires and forgets; retries handle transient failures.
- **Stripe as source of truth for payments** — StreamBridge DB mirrors Stripe state via webhooks.
- **Twenty as source of truth for relationships** — operational visibility, support tasks, and upsell pipeline live in Twenty; they never gate application logic.
- **Existing infra, zero new cloud services** — Twenty runs inside our Docker Compose / k3s stack alongside the current services.

---

## 2. Infrastructure — Self-Hosting Twenty CRM

### 2.1 `docker-compose.yml` Additions

Add the following services to the existing root `docker-compose.yml`. Twenty shares the existing `postgres` container via a dedicated logical database (`twentycrm`).

```yaml
services:

  # ── Redis (required by Twenty's BullMQ workers) ──────────────────────────────
  redis:
    image: redis:7-alpine
    container_name: streambridge_redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  # ── Twenty CRM Server ─────────────────────────────────────────────────────────
  twenty:
    image: twentycrm/twenty:latest
    container_name: streambridge_twenty
    restart: unless-stopped
    ports:
      - "3002:3000"
    environment:
      PORT: 3000
      PG_DATABASE_URL: postgresql://postgres:streambridge_dev@postgres:5432/twentycrm
      REDIS_URL: redis://redis:6379
      SERVER_URL: ${TWENTY_SERVER_URL:-http://localhost:3002}
      ACCESS_TOKEN_SECRET: ${TWENTY_ACCESS_TOKEN_SECRET}
      LOGIN_TOKEN_SECRET: ${TWENTY_LOGIN_TOKEN_SECRET}
      REFRESH_TOKEN_SECRET: ${TWENTY_REFRESH_TOKEN_SECRET}
      FILE_TOKEN_SECRET: ${TWENTY_FILE_TOKEN_SECRET}
      STORAGE_TYPE: local
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  # ── Twenty CRM Background Worker ──────────────────────────────────────────────
  twenty-worker:
    image: twentycrm/twenty:latest
    container_name: streambridge_twenty_worker
    restart: unless-stopped
    command: ["yarn", "worker:prod"]
    environment:
      PG_DATABASE_URL: postgresql://postgres:streambridge_dev@postgres:5432/twentycrm
      REDIS_URL: redis://redis:6379
      ACCESS_TOKEN_SECRET: ${TWENTY_ACCESS_TOKEN_SECRET}
      LOGIN_TOKEN_SECRET: ${TWENTY_LOGIN_TOKEN_SECRET}
      REFRESH_TOKEN_SECRET: ${TWENTY_REFRESH_TOKEN_SECRET}
      FILE_TOKEN_SECRET: ${TWENTY_FILE_TOKEN_SECRET}
      SERVER_URL: ${TWENTY_SERVER_URL:-http://localhost:3002}
    depends_on:
      - twenty
      - redis
```

**Required: update the existing `postgres` healthcheck** to cover both databases:

```yaml
  postgres:
    # ... existing config unchanged ...
    # The twentycrm DB is created automatically by Twenty on first boot.
    # No manual init script needed.
```

### 2.2 Helm Chart — `deployment/helm/streambridge/`

**`Chart.yaml`** — add Redis as a sub-chart dependency:

```yaml
dependencies:
  - name: redis
    version: "19.x.x"
    repository: https://charts.bitnami.com/bitnami
    condition: redis.enabled
```

**`values.yaml`** additions:

```yaml
# ── Redis ────────────────────────────────────────────────────────────────────
redis:
  enabled: true
  auth:
    enabled: false
  master:
    persistence:
      enabled: true
      size: 2Gi

# ── Twenty CRM ───────────────────────────────────────────────────────────────
twenty:
  enabled: true
  image:
    repository: twentycrm/twenty
    tag: latest
    pullPolicy: IfNotPresent
  replicaCount: 1
  service:
    type: ClusterIP
    port: 3000
  ingress:
    enabled: true
    host: crm.example.com          # replace with actual domain
    tls: true
  env:
    SERVER_URL: "https://crm.example.com"
    STORAGE_TYPE: local
  secrets:
    # Injected via K8s Secrets — do not hardcode values here
    accessTokenSecret: ""
    loginTokenSecret: ""
    refreshTokenSecret: ""
    fileTokenSecret: ""
  worker:
    enabled: true
    replicaCount: 1

# ── StreamBridge Backend — new env additions ─────────────────────────────────
backend:
  env:
    TWENTY_API_URL: "http://streambridge-twenty:3000"
    STRIPE_PUBLISHABLE_KEY: ""
  secrets:
    TWENTY_API_KEY: ""             # generated from self-hosted Twenty UI
    STRIPE_SECRET_KEY: ""
    STRIPE_WEBHOOK_SECRET: ""
```

**Add `templates/twenty-deployment.yaml`** and **`templates/twenty-worker-deployment.yaml`** — Kubernetes Deployment + Service manifests mirroring the Docker Compose services above.

### 2.3 K3s Setup Steps

Add to `deployment/k3s/` bootstrap sequence:

1. **Generate secrets** before cluster bootstrap:
   ```bash
   openssl rand -base64 32  # TWENTY_ACCESS_TOKEN_SECRET
   openssl rand -base64 32  # TWENTY_LOGIN_TOKEN_SECRET
   openssl rand -base64 32  # TWENTY_REFRESH_TOKEN_SECRET
   openssl rand -base64 32  # TWENTY_FILE_TOKEN_SECRET
   ```
2. Store secrets in a K8s Secret: `kubectl create secret generic twenty-secrets --from-env-file=.env.twenty`
3. Twenty auto-initialises the `twentycrm` database on first boot — no manual SQL needed.
4. After deployment, open `https://crm.example.com`, complete the onboarding wizard, and generate an API key under **Settings → APIs & Webhooks**.
5. Store the API key in K8s: `kubectl create secret generic streambridge-secrets --from-literal=TWENTY_API_KEY=<key>`

---

## 3. Database Schema — Marketplace Tables

**File:** `backend/src/db/migrations/004_marketplace.sql`

```sql
-- ── Provider Marketplace Catalog ─────────────────────────────────────────────
CREATE TABLE provider_offerings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,                        -- "Provider Alpha — Premium"
  description         TEXT,
  price_cents         INTEGER NOT NULL,                     -- e.g. 999 = $9.99
  currency            TEXT NOT NULL DEFAULT 'usd',
  billing_period      TEXT NOT NULL DEFAULT 'month',        -- 'month' | 'year'
  trial_days          INTEGER NOT NULL DEFAULT 0,
  max_connections     INTEGER NOT NULL DEFAULT 1,
  features            JSONB DEFAULT '[]',                   -- ["4K", "VOD", "Live TV"]
  stripe_price_id     TEXT UNIQUE,                          -- links to Stripe Price object
  stripe_product_id   TEXT,
  provider_network_id UUID REFERENCES provider_networks(id) ON DELETE SET NULL,
  is_featured         BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── User Subscriptions ────────────────────────────────────────────────────────
CREATE TABLE provider_subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offering_id             UUID NOT NULL REFERENCES provider_offerings(id),
  user_provider_id        UUID REFERENCES user_providers(id) ON DELETE SET NULL,
  stripe_customer_id      TEXT NOT NULL,
  stripe_subscription_id  TEXT UNIQUE NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'active',   -- active | past_due | cancelled | trialing
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancel_at_period_end    BOOLEAN NOT NULL DEFAULT false,
  cancelled_at            TIMESTAMPTZ,
  trial_end               TIMESTAMPTZ,
  twenty_subscription_id  TEXT,                             -- Twenty CRM record ID (for sync)
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Payment Audit Trail ────────────────────────────────────────────────────────
CREATE TABLE payment_transactions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id           UUID REFERENCES provider_subscriptions(id),
  amount_cents              INTEGER NOT NULL,
  currency                  TEXT NOT NULL DEFAULT 'usd',
  status                    TEXT NOT NULL,                  -- succeeded | failed | refunded
  stripe_payment_intent_id  TEXT UNIQUE,
  stripe_invoice_id         TEXT,
  failure_reason            TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Users table: add Stripe customer ID ──────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS twenty_person_id   TEXT;        -- Twenty CRM Person ID

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX idx_provider_offerings_active      ON provider_offerings(is_active);
CREATE INDEX idx_provider_offerings_network     ON provider_offerings(provider_network_id);
CREATE INDEX idx_provider_subs_user             ON provider_subscriptions(user_id);
CREATE INDEX idx_provider_subs_status           ON provider_subscriptions(status);
CREATE INDEX idx_provider_subs_stripe_sub       ON provider_subscriptions(stripe_subscription_id);
CREATE INDEX idx_provider_subs_period_end       ON provider_subscriptions(current_period_end);
CREATE INDEX idx_payment_tx_user                ON payment_transactions(user_id);
CREATE INDEX idx_payment_tx_subscription        ON payment_transactions(subscription_id);
```

---

## 4. Stripe Billing Integration

### 4.1 New File: `backend/src/services/stripeService.js`

**Responsibilities:**
- Create / retrieve Stripe Customer (linked to `users.stripe_customer_id`)
- Create Stripe Checkout Session for subscription purchase
- Cancel a Stripe subscription (at period end)
- Generate Stripe Customer Portal session for self-service billing management
- Verify webhook signatures

**Key functions:**
```js
createOrGetCustomer(user)               // idempotent — checks stripe_customer_id first
createCheckoutSession(user, offering)   // returns { url } for frontend redirect
createPortalSession(user)               // returns { url } for billing self-service
cancelSubscription(stripeSubId)         // sets cancel_at_period_end = true
constructWebhookEvent(rawBody, sig)     // verifies Stripe-Signature header
```

### 4.2 New File: `backend/src/api/webhookRoutes.js`

**Route:** `POST /webhooks/stripe`

Stripe events handled:

| Stripe Event | Action |
|---|---|
| `checkout.session.completed` | Insert `provider_subscriptions` row, provision `user_providers` credentials, emit `subscription.created` |
| `customer.subscription.updated` | Update `provider_subscriptions.status`, sync period dates |
| `customer.subscription.deleted` | Set status `cancelled`, revoke provider access, emit `subscription.cancelled` |
| `invoice.payment_succeeded` | Insert `payment_transactions` row (succeeded), emit `payment.succeeded` |
| `invoice.payment_failed` | Insert `payment_transactions` row (failed), emit `payment.failed` |

> **Important:** Raw body must be passed unparsed to `stripe.webhooks.constructEvent()`. Mount this route **before** `express.json()` middleware, or use `express.raw()` for this path only.

---

## 5. Marketplace Backend Routes

### 5.1 New File: `backend/src/api/marketplaceRoutes.js`

All routes require JWT auth unless noted.

```
GET  /api/marketplace/offerings
     → List active provider_offerings (public-facing catalog)
     → Response: [{ id, name, description, price_cents, currency, billing_period,
                    trial_days, features, is_featured, provider_network_id }]

GET  /api/marketplace/offerings/:id
     → Single offering detail

POST /api/marketplace/checkout
     → Body: { offering_id }
     → Creates/gets Stripe customer, creates Checkout Session
     → Response: { checkout_url }

GET  /api/subscriptions
     → User's own active subscriptions
     → Response: [{ id, offering, status, current_period_end, cancel_at_period_end }]

POST /api/subscriptions/:id/cancel
     → Sets cancel_at_period_end = true in Stripe
     → Response: { message, cancels_at }

GET  /api/subscriptions/portal
     → Returns Stripe Customer Portal URL for self-service billing
     → Response: { portal_url }

GET  /api/payments/history
     → User's payment_transactions (paginated)
```

### 5.2 Provision Credentials on Purchase

When `checkout.session.completed` fires, `subscriptionService.js` calls `providerService.js` to:

1. Look up `provider_offerings.provider_network_id`
2. Fetch the network's hosts from `provider_network_hosts`
3. Retrieve shared credentials from `free_access_provider_accounts` (status `available`) **or** create a new entry if the provider has dynamic account provisioning via their own API
4. Insert a `user_providers` row with those credentials
5. Store the resulting `user_provider_id` on the `provider_subscriptions` row

> **Future extension:** When integrating external provider APIs (Phase 2 of the marketplace), step 3 becomes an API call to the provider to purchase and return credentials. The rest of the flow is unchanged.

---

## 6. Twenty CRM — Data Model & Custom Objects

### 6.1 Standard Objects Used

| Twenty Object | What it Represents |
|---|---|
| `Person` | StreamBridge registered user |
| `Company` | IPTV provider partner (e.g., "Provider Alpha Ltd") |
| `Note` | Support interaction, payment failure detail |
| `Task` | Renewal reminder, failed payment follow-up, health alert |

### 6.2 Custom Objects (created via Metadata API)

**`ProviderOffering`**

| Field | Type | Maps From |
|---|---|---|
| `name` | Text | `provider_offerings.name` |
| `priceCents` | Number | `provider_offerings.price_cents` |
| `billingPeriod` | Select | `provider_offerings.billing_period` |
| `trialDays` | Number | `provider_offerings.trial_days` |
| `isActive` | Boolean | `provider_offerings.is_active` |
| `streamioId` | Text | `provider_offerings.id` |
| `company` | Relation → Company | linked IPTV provider |

**`Subscription`**

| Field | Type | Maps From |
|---|---|---|
| `status` | Select (active/past_due/cancelled/trialing) | `provider_subscriptions.status` |
| `currentPeriodEnd` | DateTime | `provider_subscriptions.current_period_end` |
| `cancelAtPeriodEnd` | Boolean | `provider_subscriptions.cancel_at_period_end` |
| `stripeSubscriptionId` | Text | `provider_subscriptions.stripe_subscription_id` |
| `streamioId` | Text | `provider_subscriptions.id` |
| `person` | Relation → Person | the customer |
| `providerOffering` | Relation → ProviderOffering | what they bought |

### 6.3 One-Time Setup Script

**File:** `backend/src/scripts/twentySetupObjects.js`

Runs once after Twenty CRM is first deployed. Uses the Twenty Metadata API to:

1. Create `ProviderOffering` custom object + fields
2. Create `Subscription` custom object + fields
3. Create relations: `Subscription → Person`, `Subscription → ProviderOffering`, `ProviderOffering → Company`
4. Add custom fields to `Person`: `lastActiveAt`, `accountStatus`, `streamioId`, `trialStatus`

```bash
# Run after Twenty is live and API key is set
node backend/src/scripts/twentySetupObjects.js
```

---

## 7. CRM Sync Pipeline

### 7.1 `backend/src/utils/eventBus.js`

Singleton `EventEmitter` shared across the application:

```js
const EventEmitter = require('events');
const eventBus = new EventEmitter();
eventBus.setMaxListeners(20);
module.exports = eventBus;
```

### 7.2 `backend/src/services/twentyCrmService.js`

All methods are async with exponential backoff retry (max 3 attempts). Failures are logged but never throw — CRM sync must never affect the user-facing response.

**Functions:**

```js
// Person (User)
upsertPerson(user)                   // create or update, keyed on users.twenty_person_id
updateUserActivity(userId, lastSeen) // PATCH lastActiveAt field

// Company (Provider Partner)
upsertCompany(providerNetwork)       // create or update IPTV provider as Company

// Custom Objects
upsertSubscription(subscription, offeringName)  // create/update Subscription record
cancelSubscription(twentySubscriptionId)         // set status = cancelled

// Tasks & Notes
createTask(personId, title, dueAt)   // payment failure, renewal due, health alert
createNote(personId, body)           // support interaction log

// Schema Setup
setupCustomObjects()                 // called by twentySetupObjects.js script

// Health
testConnection()                     // GET /health — used by admin status endpoint
```

### 7.3 `backend/src/events/crmListeners.js`

All event listeners. Imported once in `backend/src/index.js`.

| Event | Trigger | CRM Action |
|---|---|---|
| `user.created` | POST /auth/signup | `upsertPerson` |
| `user.updated` | PATCH /user/profile | `upsertPerson` |
| `user.logged_in` | POST /auth/login | `updateUserActivity` |
| `subscription.created` | Stripe checkout.session.completed | `upsertSubscription`, link to Person + ProviderOffering |
| `subscription.updated` | Stripe subscription.updated | `upsertSubscription` (status/dates) |
| `subscription.cancelled` | Stripe subscription.deleted | `cancelSubscription`, `createTask` (follow-up) |
| `payment.succeeded` | Stripe invoice.payment_succeeded | `createNote` on Person |
| `payment.failed` | Stripe invoice.payment_failed | `createNote` + `createTask` (urgent, due today) |
| `provider.health_failed` | Background health check job | `createTask` on affected subscriber's Person |
| `trial.expired` | free_access cron job | `updateUserActivity`, `createTask` (upsell) |

**Emit events in existing code:**

```js
// backend/src/api/authRoutes.js — after user insert
eventBus.emit('user.created', newUser);

// backend/src/api/authRoutes.js — after successful login
eventBus.emit('user.logged_in', { userId, lastSeen: new Date() });

// backend/src/api/webhookRoutes.js — after DB update
eventBus.emit('subscription.created', { subscription, user, offering });
eventBus.emit('payment.failed', { user, subscription, failureReason });
```

---

## 8. Inbound Webhook from Twenty

**Route:** `POST /webhooks/twenty`

**File:** `backend/src/api/webhookRoutes.js` (same file as Stripe webhooks)

Validates `X-Twenty-Webhook-Signature` (HMAC SHA256). Handles:

| Twenty Event | Action in StreamBridge |
|---|---|
| `subscription.updated` (status changed by admin) | Update `provider_subscriptions.status`, activate/revoke `user_providers` entry |
| `task.completed` (support task resolved) | Log to `error_reports` if linked to a support issue |

> Configure the inbound webhook URL in Twenty CRM under **Settings → APIs & Webhooks → Add Webhook** pointing to `https://api.example.com/webhooks/twenty`.

---

## 9. Admin UI — Marketplace & CRM Dashboard

### 9.1 Marketplace Management (`/admin/protected/marketplace`)

- **Provider Offerings Table** — list all `provider_offerings`, toggle `is_active`, edit price/features
- **"Add Offering" Modal** — form to create a new offering and sync it to Stripe as a Product + Price
- **Subscription Analytics** — active subs count, MRR, churn rate (sourced from `provider_subscriptions`)

### 9.2 CRM Status (`/admin/protected/settings/crm`)

- **Connection Status Widget** — green/red indicator from `GET /admin/crm/status`
- **Infrastructure Info** — internal URL (`http://streambridge-twenty:3000`), API key masked
- **Sync Stats** — total users synced, last sync timestamp, pending retry queue length
- **"Run Full Sync" Button** — triggers `POST /admin/crm/sync-all`, shows progress bar
- **"Open CRM" Button** — external link to the self-hosted Twenty UI

### 9.3 New Admin Routes (`backend/src/api/admin/`)

```
GET  /admin/crm/status           → testConnection() + sync queue stats
POST /admin/crm/sync-all         → batch upsert all users + subscriptions to Twenty
GET  /admin/marketplace          → list all provider_offerings (including inactive)
POST /admin/marketplace          → create offering + Stripe Product/Price
PATCH /admin/marketplace/:id     → update offering
DELETE /admin/marketplace/:id    → deactivate offering (soft delete)
```

---

## 10. Implementation Roadmap

### Phase 1 — Infrastructure Setup `~1 day`
- [x] Add Redis, Twenty server, twenty-worker to `docker-compose.yml`
- [ ] Run `docker compose up` locally, complete Twenty onboarding wizard
- [ ] Generate Twenty API key, add to `backend/.env`
- [x] Update Helm `values.yaml` + add `twenty-deployment.yaml` templates for k3s
- [ ] Document secret generation steps in `deployment/k3s/README.md`

### Phase 2 — Database Schema `~0.5 day`
- [x] Add marketplace tables to `backend/src/db/schema.sql` (idempotent, uses existing migration system)
- [x] Add `stripe_customer_id` and `twenty_person_id` columns to `users`
- [ ] Run migration locally (`npm run migrate`), verify schema
- [x] Add new query objects to `backend/src/db/queries.js`:
  - `offeringQueries` (list, listAll, findById, create, update, deactivate)
  - `subscriptionQueries` (create, update, updateByStripeId, findByStripeSubscriptionId, findByUserId, findById, getAnalytics)
  - `paymentQueries` (insert, listByUser)

### Phase 3 — Stripe Integration `~2 days`
- [x] `npm install stripe` in backend (`stripe@^22.0.1`)
- [x] Write `backend/src/services/stripeService.js` (createOrGetCustomer, createCheckoutSession, createPortalSession, cancelSubscription, constructWebhookEvent, createProductAndPrice)
- [x] Write `backend/src/api/webhookRoutes.js` (Stripe webhook handler — 5 events)
- [x] Mount webhook route **before** `express.json()` in `index.js` via `express.raw()` per-route
- [ ] Test locally with `stripe listen --forward-to localhost:3001/webhooks/stripe`
- [x] Handle all 5 Stripe events (see Section 4.2)
- [x] Write `backend/src/services/subscriptionService.js` (provision credentials on purchase)

### Phase 4 — Marketplace Routes `~1 day`
- [x] Write `backend/src/api/marketplaceRoutes.js` (all 7 routes)
- [x] Mounted at `/api` in `index.js` with full paths
- [x] `GET /api/payments/history` included
- [ ] Test full purchase flow end-to-end with Stripe test mode

### Phase 5 — Twenty Custom Objects Setup `~0.5 day`
- [x] Write `backend/src/scripts/twentySetupObjects.js`
- [ ] Run script against local Twenty instance
- [ ] Verify `ProviderOffering` and `Subscription` objects appear in Twenty UI
- [ ] Verify relations (Person → Subscription → ProviderOffering → Company) are navigable

### Phase 6 — CRM Sync Pipeline `~1.5 days`
- [x] Write `backend/src/utils/eventBus.js`
- [x] Write `backend/src/services/twentyCrmService.js` (all functions + retry wrapper)
- [x] Write `backend/src/events/crmListeners.js` (all 8 listeners)
- [x] Emit events in `authRoutes.js` (user.created, user.logged_in)
- [x] Emit events in `subscriptionService.js` (subscription.*, payment.*)
- [ ] Emit `provider.health_failed` in `jobs/scheduler.js` health check job
- [x] Import `crmListeners.js` in `index.js`
- [ ] Verify records appear in Twenty after signup + purchase

### Phase 7 — Inbound Webhook from Twenty `~0.5 day`
- [x] Add `POST /webhooks/twenty` handler to `webhookRoutes.js`
- [x] Implement HMAC signature verification (`X-Twenty-Webhook-Signature`)
- [x] Handle `subscription.updated` event (admin overrides)
- [ ] Register webhook URL in self-hosted Twenty Settings

### Phase 8 — Admin UI `~2 days`
- [x] Build `/admin/protected/marketplace` page (offerings table + add/edit modal + analytics)
- [x] Build `/admin/protected/settings/crm` page (status + sync controls + setup guide)
- [ ] Add subscription analytics widget to existing admin dashboard homepage
- [x] Wire `GET /admin/crm/status` and `POST /admin/crm/sync-all` backend routes
- [x] Add `GET/POST/PATCH/DELETE /admin/marketplace` backend routes

### Phase 9 — End-to-End Testing `~1 day`
- [ ] Full purchase flow: signup → browse → checkout → webhook → credentials provisioned → Stremio addon working
- [ ] CRM sync: verify Person, Subscription, ProviderOffering records in Twenty with correct relations
- [ ] Cancellation flow: cancel → Stripe fires event → credentials revoked → Twenty updated
- [ ] Payment failure: force failed payment in Stripe test mode → Task created in Twenty
- [ ] Admin sync: update subscription in Twenty → webhook fires → StreamBridge DB updated
- [ ] Deploy to k3s staging environment and repeat smoke tests

**Total estimated effort: ~10 days**
**Implementation status: Phases 1–8 coded; testing + Twenty onboarding + health-check event emission remain.**

---

## 11. Environment Variables Reference

Add to `backend/.env` and corresponding K8s Secrets:

```env
# ── Stripe ────────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ── Twenty CRM (Self-Hosted) ──────────────────────────────────────────────────
TWENTY_API_URL=http://streambridge-twenty:3000     # internal cluster URL
TWENTY_API_KEY=...                                  # generated in Twenty UI → Settings → APIs

# ── Twenty CRM Secrets (for docker-compose / k3s) ────────────────────────────
TWENTY_ACCESS_TOKEN_SECRET=...                      # openssl rand -base64 32
TWENTY_LOGIN_TOKEN_SECRET=...                       # openssl rand -base64 32
TWENTY_REFRESH_TOKEN_SECRET=...                     # openssl rand -base64 32
TWENTY_FILE_TOKEN_SECRET=...                        # openssl rand -base64 32
TWENTY_SERVER_URL=https://crm.example.com           # public URL of self-hosted Twenty
```

Add to `frontend-next/.env.local`:

```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

---

*Document version: 1.0 — reflects architecture review corrections (added marketplace layer, full Twenty object model, bidirectional sync, corrected phase ordering).*
