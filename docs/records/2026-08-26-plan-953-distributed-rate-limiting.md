# Lane 953 — Distributed (shared-store) rate-limit counters

Closes #953. Written before any code, per the lane brief. Scope is deliberately narrow:
**only the counter storage changes.** Named policies, buckets, partition keys, the RFC 7807
429 contract, env-configurable limits, the `PUBLY0011` analyzer, the startup guard, and the
no-PII throttle logging are all preserved exactly as delivered in #815 / PR #952.

## Problem

Every limiter partition is an ASP.NET Core in-memory `FixedWindowRateLimiter` held per
process. With N API replicas behind Traefik the effective allowance becomes
`configured_limit × N`. The strict anonymous-auth and email-producing buckets weaken the
most. Today's deployment is single-instance, so this is a pre-scaling fix, not an incident
response (#953 trigger: do it before adding a second replica).

## Deployment inventory (what shared services exist)

- Production (Dokploy on one Hostinger VPS, plain compose): `publyapp-api`,
  `publyapp-worker` (same API image), `publyapp-front`, one-shot `publyapp-migrate`,
  Traefik. Exactly **one shared stateful service: PostgreSQL 18**.
- Local development: Aspire AppHost (`apps/apphost`) starts Postgres on :5454 with a persistent data volume.
- E2E stack: Postgres plus the api/migrate/front containers.
- **No Redis anywhere** in the repo, compose files, workflows, or docs.

## Options considered

### Option A — Redis (community `RedisRateLimiting` package, or a custom Redis store)

- Purpose-built, sub-ms increments, natural TTL expiry of windows.
- Costs: a brand-new deploy dependency on the single VPS (new container, persistence,
  memory tuning, monitoring, backup story, another thing to patch at 3am). The whole
  application is already Postgres-centric; every API request already performs several
  Postgres round-trips (forwarded-header trust, session resolution, tenant resolution).
  Adding a second stateful system to share one counter per partition is a poor trade at
  this scale. Issue #953 explicitly asks to weigh the infra footprint.

### Option B — Postgres advisory locks around in-memory counters

- Rejected: advisory locks serialise writers but do not count anything. Counters would
  still live per process, so the multiplication bug survives. Locks would only order the
  races, not share the budget.

### Option C — CHOSEN: Postgres-backed fixed-window counters (atomic conditional UPSERT)

One table, one statement per acquisition, exact `FixedWindowRateLimiter` semantics:

```sql
INSERT INTO rate_limit_counters
    (policy_name, partition_key_hash, window_started_at, permit_count)
VALUES ($1, $2, $3, $4)
ON CONFLICT (policy_name, partition_key_hash, window_started_at) DO UPDATE
    SET permit_count = rate_limit_counters.permit_count + $4
    WHERE rate_limit_counters.permit_count + $4 <= $5
RETURNING permit_count;
```

- Insert path: first touch in a window; acquired iff `permit_count <= limit` (checked in
  the caller; requests larger than the whole window are refused without touching the DB,
  mirroring `FixedWindowRateLimiter`).
- Conflict path: the `WHERE` clause makes the increment **conditional** — a rejected
  acquire consumes nothing, so recipient-weighted multi-permit acquisitions cannot poison
  the window. Row-level locking on the single conflicting tuple serialises concurrent
  replicas; over-admission is impossible by construction, the same argument the upload
  byte-budget uses (`upload_budgets`, #807).
- Window rollover: `window_started_at` is the window-aligned timestamp, so a new window is
  simply a new key; the old row stops being referenced.
- Privacy: the partition key is stored as a truncated SHA-256 hash (`partition_key_hash`),
  never raw. Partition keys embed resolved client IPs, normalised emails, session-ID
  fingerprints, and tenant IDs; the existing throttle logs already hash them, and the new
  table must not become a PII side-channel.
- Housekeeping: touching a key deletes its superseded window rows; a process-throttled
  sweep (at most one per minute) deletes rows older than the maximum configured window.
  No new hosted service, no Quartz job, no worker-role coupling.

**Infra footprint of C:** zero new services, zero new images, zero workflow changes. One
table added by migration; per-request cost is one indexed UPSERT on a hot single-row
conflict target, negligible next to the session/auth round-trips every request already
makes. Redis (A) would buy microseconds at the price of a second stateful system — not
worth it while the fleet is one VPS.

## Failure mode when the store is unreachable

The Postgres counter store embeds a small circuit breaker: five consecutive failures open
it for 30 s; while open, acquisitions do not dial Postgres at all (no timeout amplification
during an outage); a half-open probe retries after the cooldown. While the breaker is
**closed**, a failed acquisition applies the policy's fail mode for that one call.

Two fail-mode classes:

**Fail CLOSED** — `anonymous-auth-per-ip`, `anonymous-auth-per-email`,
`password-reset-per-email`, `email-operation`, `tenant-email-operation`.

Why: these are the abuse-control boundaries. Their partitions are keyed on attacker-chosen
values (client IP, email address), so failing open hands unlimited password-spraying,
registration-flood, verification-link spam, and email-bombing budgets to whoever arrives
during an incident. The email buckets additionally protect the Resend sender reputation —
a burned domain takes days to recover and affects every legitimate user. These limits exist
precisely for the moments when systems misbehave; they must tighten under failure, not
vanish.

**Fail OPEN** — everything else: the `global-safety-net` floor, `authenticated-default`,
`heavy-search-list`, bulk/export/upload/social-connect families (session- and
tenant-partitioned), and `anonymous-other`.

Why: every one of those policies throttles authenticated domain work, and domain work
already requires Postgres (sessions, tenants, data). When the shared store is down the API
is degraded anyway; rejecting additional traffic would convert a database incident into a
total outage without buying protection — an attacker cannot reach meaningful handlers any
better than a legitimate user can. The global floor stays fail-open because it is a
process-protection net, not an identity boundary: with the breaker open a flood costs a
socket plus a pipeline walk and no database dials, which the box absorbs; blanketing every
request in 429 during a transient brownout would punish clients for an infrastructure
problem they cannot see.

This split follows the brief's mandate (anonymous-auth and email-producing fail CLOSED) and
keeps the availability story coherent for everything else.

## Configuration

New optional variable `RATE_LIMIT_COUNTER_STORE` ∈ {`postgres`, `memory`}
(case-insensitive), **default `postgres`**.

- Defaulting to the shared store closes the silent-regression trap: an operator who scales
  to two replicas without reading docs still gets one shared budget. Single-replica
  deployments pay the negligible UPSERT cost and gain parity between staging and prod.
- `memory` remains an explicit escape hatch (documented in the runbook): process-local
  counters, the pre-#953 behavior, usable without redeploying images.
- Optional by design: no `GetRequiredString`, so the build-env completeness guard
  (`AppEnvironmentBuildEnvCompletenessSpec`) correctly does not demand it from the
  Dockerfile build stages or the e2e stack. `.env.example` gains the quoted default;
  `dokploy.yml` passes it through for api and worker so operators can tune it.

## What changes, mechanically

- New entity `RateLimitCounter` (`rate_limit_counters`: composite PK
  `policy_name` + `partition_key_hash` + `window_started_at`, `permit_count`) + migration.
- New `IRateLimitCounterStore` with two implementations: `MemoryRateLimitCounterStore`
  (the existing in-memory machinery, moved verbatim behind the interface, preserving
  eviction/idle behavior) and `PostgresRateLimitCounterStore` (UPSERT above, breaker,
  fail modes, sweeps). Connections are borrowed from the scoped `AppDbContext` via
  `IServiceScopeFactory` so integration-test hosts automatically see their per-class test
  database (never `POSTGRES_CONNECTION_STRING` directly — the trap `ApiFactory` documents).
- `ApiRateLimiterStore` / `AnonymousAuthRateLimiterStore` keep their names, signatures, and
  unknown-policy exceptions; their `CreateSingle`/`CreatePerIp`/`CreatePerEmail` internals
  now build limiters over the injected counter store. Chained and recipient-weighted paths
  are untouched structurally.
- Rejection responses, `Retry-After`, sampled no-PII logging: unchanged; the new limiter
  adapter supplies `Retry-After` metadata (remaining window) exactly as the fixed-window
  limiter did.

## Non-goals (enforced)

No policy renamed, no bucket changed, no partition key changed, no 429 contract change →
`just generate-client` must show **zero drift**. `PUBLY0011` and the startup guard pass
unmodified. Throttle logs keep hashing partitions; store-failure warnings name only the
policy class and fail mode, never a partition value.

## Verification plan

1. Unit specs, both stores: window rollover (manual `TimeProvider`), concurrent increments
   atomic (contenders ≥ 2× limit; successes == limit exactly), conditional non-consumption
   on rejection, sweep deletion.
2. Integration spec: **two `WebApplicationFactory` hosts over one test database**; N−1
   requests on host A, then 1 on host B → RFC 7807 `429` with `Retry-After` on host B.
   Paired RED proof: switching the store selection back to `memory` turns this spec red
   (each host regains an independent budget); recorded with output + md5 in `.dump/proof-red.md`.
3. Store-unreachable spec: dead-endpoint connection string; per-policy-class expectations —
   anonymous-auth and email policies reject (CLOSED), the rest admit (OPEN), breaker stops
   dialling.
4. Full `just test-api` under `heavy.sh` (CI does not run it; totals quoted in the PR),
   `just build-api && just generate-client` with zero client drift.

## Operator runbook delta

- Scale-out prerequisite checklist item: verify `rate_limit_counters` exists (applied by the
  one-shot migrate), keep `RATE_LIMIT_COUNTER_STORE=postgres` (default), and remember the
  budget is now fleet-wide — lowering limits now affects all replicas at once.
- Incident lever: set `RATE_LIMIT_COUNTER_STORE=memory` on api/worker and recreate to
  shed the shared-counter dependency during a Postgres incident (accepting per-process
  budgets and the fail-CLOSED behavior of the abuse buckets, which then never consult the
  DB at all).
- Alerting guidance unchanged; store-failure warnings are the new signal that the limiter
  is running on its breaker.
