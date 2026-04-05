# Admin-Managed Trial System

## Goal

Let a new user try the platform without bringing their own IPTV subscription.

The admin preloads one or more Xtream-style providers. Each provider can have:

- multiple domains
- multiple username/password accounts
- a trial policy

The system assigns a trial account to the user for 7 days, exposes managed movie and series resolution through the addon, hides provider details from the user-facing product, blocks live TV during trial, and removes or disables expired trial access automatically.

## Final Product Rules

- Trial length: 7 days
- Trial content: all managed movies and series
- Live TV during trial: disabled
- Renewal rule for now: user may request a new trial only after the previous trial has expired
- Renewal limit for now: unlimited, but only one active trial at a time per user
- User-facing URL model: keep the existing addon token URL
- Stream delivery model: server resolves the assigned provider/account internally and returns the stream
- Provider/account details: never shown in UI or addon responses
- App browsing during trial: disabled unless the user adds their own provider

## Core Decision

Do not generate a permanent user-visible URL from raw provider credentials.

Instead:

1. User signs up.
2. System assigns one trial account from an admin-managed account pool.
3. User keeps using the normal addon URL:
   `https://app/addon/{token}/manifest.json`
4. When Stremio requests catalog or stream data, the backend resolves the assigned trial source internally.
5. For playback, backend generates the final working stream URL from the selected provider domain and assigned account at request time.

This keeps the product simple for the user and gives the backend full control over:

- domain rotation
- active connection checks
- expiry
- live/VOD restrictions
- renewal gating

## Recommended Data Model

Add four concepts instead of overloading `user_providers`.

### 1. `trial_provider_groups`

Admin-defined provider groups.

Fields:

- `id`
- `name`
- `is_active`
- `trial_days` default `7`
- `allow_live` default `false`
- `notes`
- `created_at`

### 2. `trial_provider_hosts`

Domains under a provider group.

Fields:

- `id`
- `provider_group_id`
- `host`
- `priority`
- `is_active`
- `last_checked_at`
- `last_status`
- `last_response_ms`

### 3. `trial_provider_accounts`

Xtream credentials owned by admin and used for trials.

Fields:

- `id`
- `provider_group_id`
- `username`
- `password`
- `status` enum: `available`, `assigned`, `suspended`, `expired`, `invalid`
- `max_connections`
- `last_active_connections`
- `last_expiration_at`
- `last_checked_at`
- `last_assigned_at`
- `created_at`

### 4. `user_trials`

Assignment record between a user and a trial account.

Fields:

- `id`
- `user_id`
- `provider_group_id`
- `account_id`
- `status` enum: `active`, `expired`, `revoked`, `renewed`
- `started_at`
- `expires_at`
- `expired_at`
- `last_stream_at`
- `renewal_number`

## User Flow

### New user without IPTV

1. User signs up.
2. User chooses "Try free for 7 days".
3. Backend finds one eligible trial account.
4. Backend creates a `user_trials` row.
5. Backend exposes addon/catalog normally from the assigned trial source, including app browsing for managed movies and series.
6. Live TV routes are hidden or return `403`.

### After expiry

1. User logs in after trial expiry.
2. User sees "Your free trial expired. Start a new trial."
3. Backend confirms there is no active trial.
4. Backend assigns another available account.
5. New 7-day trial starts.

## Trial Allocation Rules

When assigning an account:

1. Only select accounts from active provider groups.
2. Only select accounts whose Xtream API auth passes.
3. Only select accounts whose current active connections are below limit.
4. Prefer hosts marked healthy by health checks.
5. Prefer accounts with the lowest recent assignment count.
6. If an account is already assigned to an active trial, do not reuse it.

Recommended account selection priority:

- healthy host available
- `active_cons = 0`
- least recently assigned
- longest remaining upstream expiry

## How To Build The Stream URL Correctly

The right abstraction is a server-side stream resolver.

### Internal flow

1. Request comes to addon `stream` handler.
2. Backend loads the user's active trial.
3. Backend loads the assigned account and the provider group's healthy hosts.
4. Backend checks Xtream `player_api.php` on the candidate host using the assigned account.
5. Backend confirms:
   - auth is valid
   - upstream account is not expired
   - `active_cons < max_connections`
6. Backend builds the final stream URL only for the chosen host/account.
7. Backend returns that stream to the client.

### Stream URL pattern

For VOD:

`{host}/movie/{username}/{password}/{stream_id}.{ext}`

For series episode:

`{host}/series/{username}/{password}/{stream_id}.{ext}`

For live:

`{host}/live/{username}/{password}/{stream_id}.{ext}`

Live is disabled for trials, so the trial path should never emit live URLs.

## Better Multi-Provider Strategy

Do not store one generated URL per user.

Store:

- assigned account
- provider group
- list of available hosts

Then resolve dynamically on each stream request.

That gives:

- automatic host failover
- no need to reissue URLs when a domain changes
- no stale stream URLs tied to dead hosts
- cleaner support for one provider with many domains

## Xtream API Checks To Use

Use `player_api.php?username=...&password=...` before assignment and during health checks.

Read from `user_info`:

- `auth`
- `status`
- `exp_date`
- `is_trial`
- `active_cons`
- `max_connections`
- `allowed_output_formats`

Read from `server_info`:

- `url`
- `port`
- `https_port`
- `time_now`
- `timezone`

### Account is eligible only if

- `auth` is truthy
- `status` is not disabled/banned
- `exp_date` is in the future, or null if provider omits it
- `active_cons < max_connections`

### Important nuance

A host can be healthy while an account is unusable.

So the system needs two checks:

- host health check
- account eligibility check

Do not treat them as the same thing.

## Expiry And Cleanup

Add a scheduled job, for example every hour.

### Trial expiry job

1. Find `user_trials` with `status = active` and `expires_at <= now()`.
2. Mark trial row as `expired`.
3. Release the assigned account back to `available` only if upstream credentials are still valid and not renewed elsewhere.
4. Disable trial access for the user immediately.
5. Remove trial-only catalog cache entries.

### Upstream renewal check

Before releasing or deleting an expired account assignment, re-check Xtream API:

- if upstream credentials were disabled, mark account `invalid`
- if upstream credentials are still valid, keep account reusable
- if your business later supports paid upgrades, check whether the same username/password was converted to a paid state before removing access

## Catalog Rules During Trial

- Include movies and series only
- Exclude live categories entirely
- Exclude any menu item that suggests live TV access
- Mark the account internally as `trial_managed`

The cleanest implementation is to filter by `vod_type IN ('movie', 'series')` for trial users at query time and skip live fetch/refresh for trial catalogs.

## Admin Capabilities Needed

Admin should be able to:

- create provider groups
- add multiple domains to a provider group
- add multiple Xtream username/password accounts to a provider group
- test all hosts
- test all accounts
- see account availability
- see which user is using which account
- see trial start and expiry dates
- manually expire or revoke a trial
- manually reassign a user to a different account

## Guardrails

- Only one active trial per user
- User cannot renew early
- User cannot hold multiple trial accounts at once
- Trial account cannot be assigned if active connections are already in use
- Trial stream resolution must retry another healthy host when the first host fails
- Trial catalog must never leak live streams

## Recommended Implementation Order

1. Add trial schema and queries
2. Add admin CRUD for provider groups, hosts, and accounts
3. Add trial allocation service
4. Add expiry job
5. Update signup and dashboard flow for "start free trial"
6. Update addon handlers to resolve trial streams dynamically
7. Block live endpoints for trial users
8. Add admin visibility for trial usage and expiry

## What Not To Do

- Do not bind users to a single raw provider domain forever
- Do not precompute permanent stream URLs for trial users
- Do not mix trial-managed accounts into normal user-owned provider rows without a source/type flag
- Do not assume host health means account availability
- Do not allow live TV in trial logic unless the product decision changes

## Short Final Version

The finalized idea is:

- admin manages pools of Xtream accounts grouped by provider
- each provider can have many domains
- each new trial user gets one account for 7 days
- live TV is disabled during trial
- addon URL stays the same; the backend resolves the actual stream internally
- stream host is chosen dynamically from healthy domains
- account eligibility is checked from Xtream API using `auth`, `exp_date`, `active_cons`, and `max_connections`
- when trial expires, background job disables access and releases the account only after checking whether the account is still valid or has been renewed for another use
- user can start a new trial only after the old one expires
