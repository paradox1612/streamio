# Twenty Operational CRM Model

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
