# Twenty Operational CRM Model

## Verified Live Findings

- Verified against the live K3s deployment on April 9, 2026.
- Twenty metadata shows the custom object names as:
- `providerAccess` / `providerAccesses`
- `subscription` / `subscriptions`
- `providerOffering` / `providerOfferings`
- The generated REST collection path for provider access is `GET /rest/providerAccesses`.
- The backend admin auth route is `POST /api/admin/auth/login`, not `/api/admin/login`.
- The backend full CRM sync route is `POST /api/admin/crm/sync-all`.
- The live workspace already had a duplicate-record failure mode:
- duplicate `Person` creation returned `400 BadRequestException` with `"A duplicate entry was detected"`
- duplicate `Company` and `Provider Access` records were created when local `twenty_*_id` columns were still `NULL`
- The local database columns required for the CRM linkage are:
- `users.twenty_person_id`
- `provider_networks.twenty_company_id`
- `user_providers.twenty_provider_access_id`

## Reality Of The Integration

- StreamBridge remains the source of truth for users, payments, subscriptions, and provider access.
- Twenty is an operational mirror plus workflow surface.
- The local `twenty_*_id` columns are not optional bookkeeping. They are what make sync idempotent.
- If a Twenty record exists but the local `twenty_*_id` field is still `NULL`, the next sync will try to create again unless the sync code first reconciles against existing Twenty records.

## Object And Field Conventions

- `Person`
- standard Twenty object
- custom fields:
- `streamioId`
- `accountStatus`
- `lastActiveAt`
- `Subscription`
- custom object
- linked logically to a person
- currently mirrored from `provider_subscriptions`
- `Company`
- standard Twenty object
- custom field:
- `streamioNetworkId`
- `Provider Access`
- custom object
- mirrored from `user_providers`
- one `Provider Access` per user-provider row
- includes both marketplace-managed and external providers
- important custom fields:
- `streamioId`
- `personId`
- `companyId`
- `providerName`
- `sourceType`
- `providerStatus`
- `accountStatus`
- `accountExpiresAt`
- `maxConnections`
- `activeConnections`
- `primaryHost`
- `hostCount`
- `hostList`
- `networkId`
- `networkName`
- `accountLastSyncedAt`

## Relation Field Naming Rules

- Twenty relation field creation generates an underlying `<fieldName>Id` column name.
- Because `providerAccess` already has text fields named `personId` and `companyId`, a relation field named `person` or `company` will collide.
- Do not create relation fields on `providerAccess` named `person` or `company`.
- Use non-conflicting names:
- `providerAccess.personRecord`
- `providerAccess.companyRecord`
- Those relation fields can target:
- `person.providerAccesses`
- `company.providerAccesses`
- Keep the text fields `personId` and `companyId` anyway. They are still useful for debug visibility and fallback matching.

## Sync Rules That Matter

- `upsertPerson` should reconcile by:
- local `users.twenty_person_id` first
- then existing Twenty `Person.streamioId`
- then existing Twenty `Person.emails.primaryEmail`
- `upsertCompany` should reconcile by:
- local `provider_networks.twenty_company_id` first
- then existing Twenty `Company.streamioNetworkId`
- then exact company name as a last resort
- `upsertProviderAccess` should reconcile by:
- local `user_providers.twenty_provider_access_id` first
- then existing Twenty `ProviderAccess.streamioId`
- After any successful match or create, persist the Twenty ID back to Postgres immediately.

## Operator Runbook

- Check whether the deployment left a migration `Job` behind:

```bash
KUBECONFIG=~/.kube/config-k3s kubectl get jobs -n streambridge
```

- If the job still exists, inspect its logs:

```bash
KUBECONFIG=~/.kube/config-k3s kubectl logs -n streambridge job/<migration-job-name>
```

- Re-run the Twenty setup script in the deployed backend container:

```bash
KUBECONFIG=~/.kube/config-k3s kubectl exec -n streambridge deploy/streambridge-streambridge-backend -- \
  node src/scripts/twentySetupObjects.js
```

- Get the Twenty API key from the backend env secret:

```bash
API_KEY=$(KUBECONFIG=~/.kube/config-k3s kubectl get secret streambridge-streambridge-backend-env -n streambridge -o jsonpath='{.data.TWENTY_API_KEY}' | base64 --decode)
```

- Port-forward Twenty locally:

```bash
KUBECONFIG=~/.kube/config-k3s kubectl port-forward -n streambridge svc/streambridge-streambridge-twenty 3300:3000
```

- Inspect metadata to confirm the custom object names:

```bash
curl -sS -H "Authorization: Bearer $API_KEY" -H 'Content-Type: application/json' \
  http://127.0.0.1:3300/metadata \
  -d '{"query":"{ objects(paging: { first: 200 }) { edges { node { nameSingular namePlural } } } }"}'
```

- Inspect the live REST collection directly:

```bash
curl -sS -H "Authorization: Bearer $API_KEY" \
  http://127.0.0.1:3300/rest/providerAccesses
```

- Get an admin token from StreamBridge:

```bash
curl -sS -X POST ${PUBLIC_BASE_URL:-https://stream.example.com}/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"<admin-username>","password":"<admin-password>"}'
```

- Trigger a full CRM sync:

```bash
curl -X POST ${PUBLIC_BASE_URL:-https://stream.example.com}/api/admin/crm/sync-all \
  -H "x-admin-token: <admin-token>"
```

- Check CRM status:

```bash
curl -sS ${PUBLIC_BASE_URL:-https://stream.example.com}/api/admin/crm/status \
  -H "x-admin-token: <admin-token>"
```

## What To Check In Twenty

- `Person`
- one record per StreamBridge user
- email should match StreamBridge email
- `streamioId` should match local user UUID
- `Company`
- one record per provider network
- `streamioNetworkId` should match local provider network UUID
- `Provider Access`
- one record per `user_providers` row
- `sourceType=EXTERNAL` for user-supplied providers
- `sourceType=MARKETPLACE` for marketplace-managed providers
- `accountExpiresAt`, connection counts, and host fields should populate after provider account refresh

## Current Known Failure Modes

- Duplicate `Person` in Twenty with local `users.twenty_person_id = NULL`
- symptom: `upsertPerson(...) failed ... "A duplicate entry was detected"`
- effect: sync may continue, but local linkage stays broken
- Duplicate `Company` or `Provider Access`
- symptom: repeated sync runs create additional rows in Twenty
- cause: local `twenty_company_id` or `twenty_provider_access_id` stayed `NULL`
- `Provider Access` shows as `Untitled`
- cause: the standard `name` field on the custom object was never populated even though `providerName` was
- effect: the list view is harder to use even when the data is otherwise present
- Relation field creation collisions
- symptom: metadata validation errors around `personId` or `companyId`
- cause: relation names `person` and `company` collide with existing text fields

## Cleanup Workflow For Existing Duplicates

- Keep one canonical `Person`, `Company`, and `Provider Access` in Twenty.
- Delete the duplicates in the Twenty UI first.
- Deploy the reconciled sync code.
- Re-run the setup script so relation fields exist in the workspace.
- Run a full CRM sync once.
- Confirm the local DB now stores:
- `users.twenty_person_id`
- `provider_networks.twenty_company_id`
- `user_providers.twenty_provider_access_id`
- Only after those IDs are present locally should you trust future sync runs to stay idempotent.

## Operating Model

- Streamio is the system of record for users, subscriptions, payments, and access provisioning.
- Twenty is the operator console for customer lifecycle visibility, support follow-up, churn recovery, and provider relationship context.
- Sync is one-way by default: Streamio and Stripe events write into Twenty.
- Write-back from Twenty should stay narrow and explicit. Safe examples are workflow actions such as cancellation review or support completion. Raw field edits in Twenty should not become billing or entitlement truth.

## Phase 1 Scope

- Sync `Person` records from Streamio users.
- Sync `Subscription` records from marketplace subscriptions.
- Sync provider `Company` records from provider networks.
- Sync `Provider Access` records from `user_providers`, including external providers not sold through the marketplace.
- Create operational notes and tasks for:
- payment failures
- cancellation requests
- fully cancelled subscriptions
- provider health failures
- Show CRM connectivity and sync coverage in the admin UI.

## Phase 1 Event Rules

- `user.created` / `user.updated`
- Upsert the matching `Person` in Twenty.
- `subscription.created`
- Upsert the customer `Person`, then create or update the custom `Subscription` object in Twenty.
- `subscription.updated`
- Mirror status and billing-period changes into Twenty.
- If status moves to `past_due`, create a payment recovery note and task.
- If `cancel_at_period_end` flips on, create a retention note and follow-up task.
- `subscription.cancelled`
- Mark the Twenty subscription as cancelled and create a churn follow-up task.
- `provider.created` / `provider.updated`
- Upsert a `Provider Access` record so each user provider is represented independently.
- `provider.account_updated`
- Refresh provider access expiration, account status, active connections, and host metadata in Twenty.
- `provider.deleted`
- Mark the provider access as removed in Twenty rather than deleting CRM history.
- `payment.succeeded`
- Add a payment success note to the person timeline.
- `payment.failed`
- Add a failure note and urgent collection task.
- `provider.health_failed`
- Create an operator task on the affected person for outage follow-up.

## Data Ownership

- Billing status comes from Stripe webhook processing in Streamio.
- Provisioning and access revocation happen in Streamio only.
- Twenty records are mirrors plus operational workflow artifacts.
- A user can have multiple provider access records. Marketplace-managed and external providers are both valid and must be modeled separately.
- Provider expiration belongs to the user-provider access record, not the provider company and not the marketplace subscription.

## Next Recommended Slice

- Add provider-company sync so provider networks appear as `Company` records in Twenty.
- Add relation fields between `Subscription`, `Person`, and provider `Company`.
- Add admin actions for safe write-back workflows instead of generic field edits.
- Add tests around CRM listeners and webhook normalization.
