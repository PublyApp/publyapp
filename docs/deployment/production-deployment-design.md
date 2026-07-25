# Production Deployment & Migration Design

**Issue:** #876 (closed) · **Status:** implemented — **live in production since 2026-07-20** ·
**CI-guard follow-up:** #877 (closed)

This document is the architecture and decision record for how PublyApp deploys to production and
applies database migrations. The decisions below are in force; where the original design assumed
something that turned out not to be true on the real instance, the assumption is marked
**SUPERSEDED** in place rather than deleted, so the reasoning stays auditable.

It supersedes the older `docs/misc/deployment-guide.md` (artifact-upload flow) and
`docs/misc/database-migration-deployment.md` (generic/stale, references SQL Server `sqlcmd` and a
DbContext class that no longer exists).

Host: **Dokploy on a single Hostinger VPS**, GHCR images, Traefik SSL. Grounded in `dokploy.yml` +
`apps/api/Dockerfile`, plus a second architectural opinion (GPT-5.6-sol) captured during design.

> **The runtime is plain `docker compose`, not Swarm.** Confirmed on the first deploy
> (the deploy log reports `Compose Type: docker-compose`). Every Swarm-specific expectation in the
> original design — rolling updates, task reaping/rescheduling, `deploy.restart_policy` — is
> therefore inert. `restart:` governs; an unhealthy container is not killed, it stays running and
> Traefik withholds routing. Individual paragraphs below carry a **SUPERSEDED** marker where they
> assumed Swarm.

> **Migration gating — ratified approach A:** the deployed configuration does not use the
> pre-deploy hook assumed by decision 3 below. The ratified and now shipped implementation is a
> one-shot migrate service plus API readiness and worker startup gates. See the
> [Production Deploy Runbook](./production-deploy-runbook.md). This note supersedes the
> earlier pre-deploy-command design.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Process topology | **Split** — separate `api`, `worker`, and `front` services (not a combined `APP_ROLE=all`) |
| 2 | Migration mechanism | **Apply directly** (automated), packaged as an **EF migration bundle** (no SDK/source in prod) |
| 3 | Migration execution | **One-shot migrate service** plus API readiness and worker startup gates, each with a five-minute startup grace |
| 4 | Seeding | **Split by intent** — essentials idempotent everywhere, demo gated OFF in Production, owner via bootstrap |
| 5 | Deploy model | **Expand/contract** (backward-compatible) migration discipline. *Zero-downtime via Swarm rolling: **SUPERSEDED** — the instance runs plain Compose, so a deploy has a short recreate gap. Expand/contract still holds and is the half that mattered.* |
| 6 | DB credentials | **Single** app credential (migrator + runtime share one role) |
| 7 | Frontend target | **`apps/front-2`** (SSR), deployed under the generic service name `publyapp-front`. `apps/front` is retired and is not built for release. |

### Why these (rationale)
- **Split (1):** builds the target topology from day one; `APP_ROLE=all` remains the Development/Testing default when the role is omitted. Split gives process/operational isolation. It is only worse than combined if the VPS OOMs/swaps or connection pools are uncapped — both mitigated below.
- **Bundle (2):** same automated "apply-directly" behaviour as `dotnet ef database update`. The SDK-based `migrations` build stage creates `efbundle`; the final `migrate` stage uses the ASP.NET runtime image and copies only that bundle, not the SDK, EF tooling, or source tree. The bundle still runs `UseSeeding`.
- **One-shot service (3):** the active Compose file has no `depends_on`; the immutable migrator runs as a one-shot service while API readiness and the worker startup gate block application work. A five-minute healthcheck startup grace matches the bounded wait. The migrate service carries **both** `restart: "no"` (active Compose control) and `deploy.restart_policy.condition: none` (non-active Swarm contingency).
- **Seeding split (4):** **SUPERSEDED:** the original design found that seeders ran unconditionally and would have included demo fixtures in Production. The shipped `CreateSeeders` filter excludes every `IsDemo` seeder in Production, while non-demo seeders — including permissions, system definitions, and the owner bootstrap — still run. A Production-process spec verifies both sides of the gate.
- **Zero-downtime + expand/contract (5):** owner chose zero-downtime. It has two halves: **schema safety** (expand/contract — always ours to control) and **deploy mechanics** (Swarm rolling on Dokploy). Expand/contract is the real guarantee and it shipped. **SUPERSEDED — the deploy-mechanics half:** the instance runs plain Compose, so there is no rolling update and a deploy has a brief container-recreate gap. Getting true no-gap cutover later means switching the app to Dokploy "Stack" (Swarm) or fronting it with two health-gated replicas; neither is done, and neither is needed at current traffic.
- **Single credential (6):** least-privilege DDL/DML split remains deferred; its default-privileges management adds outage risk for limited current benefit. Revisit if the threat model changes.
- **front-2 (7):** front-2 is the go-forward UI and deploys under the generic service name `publyapp-front`; the retired `apps/front` has no release image.

## Architecture as deployed

One immutable release tag per deploy → **migrate + gated api/worker + front** start concurrently.

A release publishes **three** image artifacts, all tagged with the same commit SHA:
`ghcr.io/radandevist/publyapp/api` (`apps/api/Dockerfile`, target `runtime`), `…/migrate` (same
Dockerfile, target `migrate`), and `…/front-2` (`apps/front-2/Dockerfile`). Four **services** run
from them — the worker reuses the API image with a different `APP_ROLE`, so there is no fourth image.

| Service | Image | `APP_ROLE` | Health check | Public (Traefik) |
|---------|-------|-----------|--------------|------------------|
| **publyapp-migrate** (EF bundle, one-shot service) | `migrate` | `api` | process exit code (container remains exited; inspect non-zero) | — |
| **publyapp-api** | `api` | `api` | `GET /health/live` (liveness), `GET /health/ready` (readiness) | `api.publyapp.com` |
| **publyapp-worker** | `api` (same image) | `worker` | `--worker-health` CLI (no HTTP surface) | — |
| **publyapp-front** (front-2 SSR) | `front-2` | — | `GET /health` | `publyapp.com`, `www.publyapp.com` |

Deploy flow:
1. The release publishers — `.github/workflows/deploy-images.yml` or local `just deploy-images` — build and push the same three immutable-tagged images (`…:<release>`), including the migrator-bundle image.
2. Dokploy starts the one-shot migrator and application services concurrently. API readiness and the worker startup gate remain closed until the bundle applies migrations and production-safe seeds.
3. API and worker healthchecks have a five-minute `start_period`, matching the worker gate budget. Under plain Compose the container is not killed for failing its healthcheck: it stays running and Traefik withholds routing until `/health/ready` passes. **SUPERSEDED (Swarm-only):** the original wording said Swarm keeps the task alive during the grace and a failure beyond the budget becomes a failed/rescheduled task. There is no rescheduling here — a stuck migration simply leaves the app unrouted, which is why the migrate container's exit code must be watched during a deploy.
4. **SUPERSEDED (Swarm-only):** the **worker's** brief two-instance overlap during a *rolling* update. Plain Compose recreates rather than rolls, so no overlap occurs today. The safety properties still hold and are what would make a future roll safe: 2B's fenced leases + advisory-lock scheduler leadership + ~45s graceful drain prevent double-execution.

## Migrations
- **Bundle** built by the release publishers (`dotnet ef migrations bundle`, target the VPS runtime), shipped in a slim image; run by the one-shot migrate service. Runs `UseSeeding` (gated — see below).
- **Expand/contract discipline:** no breaking schema change in a single release; destructive changes split across two releases (expand → deploy code using both → contract later). The automated guard from **#877 has shipped and #877 is closed**: `just ci-migration-expand-contract` (`scripts/check-migration-expand-contract.mjs`, part of `just ci`) flags destructive migration operations and accepts a justified `// expand-contract-ok: <reason>` marker. It runs in the local pre-push gate, not as a GitHub workflow.
- **Single DB credential** shared by migrator + runtime.
- **Rollback:** prefer backward-compatible forward migrations + backups + forward fixes. Do **not** rely on automatic `Down()` in production (it can destroy newly-written data).

## Seeding
- **Essential** (permission catalog, required system profiles, scheduler/system-job definitions): run in **every** environment, idempotent (stable-key upsert). May stay attached to the migrate step. Must be safely repeatable — `UseSeeding` runs even when no migration is pending.
- **Demo fixtures** (Acme tenant; Alice/Charlie/Acme users; known-password accounts): **Development/Testing only**, with a **test that asserts they are excluded in Production**.
- **Owner:** provisioned via the `STAFF_OWNER_*` bootstrap flow, **not** the demo seeder path. Confirmed: the bootstrap takes the password from `STAFF_OWNER_BOOTSTRAP_CODE`, not a committed value. Note the operational consequence — `OwnerBootstrapSeeder` is idempotent **by email** and never rewrites an existing owner's password, so changing `STAFF_OWNER_BOOTSTRAP_CODE` after the first successful migration has no effect.

## Config, secrets, resources
- **Required `AppEnvironment` values** must be supplied to `api`, `worker`, and `migrate`; missing required strings/integers fail fast. Many tuning and storage settings use `GetOptional*` defaults and may be omitted. `dokploy.yml` supplies the required values and also passes explicit values for many optional settings. Secrets live in Dokploy's env management, never committed.
- **A secret must contain no `#`.** Dokploy writes the Environment tab to a host `.env`, where `#` starts a comment, so the value is silently truncated with no error. Keep env values to alphanumerics plus `-_.`.
- **`TRUSTED_PROXY_CIDRS` must be Traefik's exact address as `/32`** (or `/128` for IPv6), never the network CIDR — see the note in the [first-deploy runbook](./first-deploy-runbook.md) §5a. A missing value crash-loops the API on a Production `api` role.
- **`APP_ROLE`** is required in Production (from 2B): `api`/`migrate` → `api`, `worker` → `worker`.
- **Connection pool caps** per role so `api` + `worker` + scheduler-leadership + LISTEN/NOTIFY connections leave an admin reserve under the database's configured connection limit. In force: **api `MaxPoolSize=50`, worker `MaxPoolSize=30`**; tune under load.
- **Immutable release tags** for every service (api, worker, front, migrate) — never `latest`.
- Keep worker concurrency/batch sizes conservative so a queue burst cannot starve HTTP or Postgres on the shared host.

## First-deploy footguns — all fixed
These would have broken deploy #1. They are resolved in the committed `dokploy.yml`:
- Required env set declared (was 2 vars → instant fail-fast), with optional tuning values explicit where operations chose them.
- Healthcheck `curl` vs Dockerfile `wget` mismatch corrected (the API healthcheck could never pass).
- Fixed `container_name` removed.
- Ordering no longer relies on `depends_on` at all — there is none in the file. Each service carries its own healthcheck (API readiness, worker `--worker-health`, front `GET /health`) and Traefik withholds routing until it passes.
- Immutable tags pinned (`${RELEASE_TAG}` per service, never `latest`).
- The two stale `docs/misc/` deployment docs are marked superseded and link here.

## Sequencing & dependencies (historical — complete)
- This design depended on 2B (`APP_ROLE` + the worker composition root); approving it unblocked merging 2B → 2C → P3, the work #876 was gating. All of that has landed.
- Everything in the original implementation order shipped: deploy config, the CI **bundle** build (`apps/api/Dockerfile` stage `migrations` runs `dotnet ef migrations bundle`, stage `migrate` ships only the bundle), the one-shot migrate service, API/worker gates, the seeding gate + Production-exclusion test, the required env/secret set, pool caps, immutable tags, and the footgun fixes.
- front-2 deployability: `/health` route added; its Dockerfile and production env set confirmed.

## Non-goals / still deferred
- **Least-privilege DDL/DML credential split** — still deferred; the migrator and runtime share one credential (decision 6). Revisit if the threat model changes.
- **True zero-downtime cutover** — not achieved; the instance runs plain Compose, so a deploy recreates containers. Would require Dokploy "Stack" (Swarm) or health-gated replicas.
- **Blue/green / multi-replica horizontal scale** — the split topology and immutable tags keep the door open; not needed at current traffic.
- ~~Automated expand/contract CI guard (#877)~~ — **done**, see Migrations above.

## Verification (all performed)
- Local `docker compose` smoke: migrate (bundle) → api + worker come up healthy with the full env; API `/health/live` stays 200 while `/health/ready` changes from 503 to 200, and worker `--worker-health` stays fresh during the gate wait.
- A spec asserts **demo seeders do not run under `ASPNETCORE_ENVIRONMENT=Production`** and essentials do.
- The first real deploy (2026-07-20) walked the whole flow on the instance. What was confirmed, and the five traps that cost real debugging time, are recorded in the [first-deploy runbook](./first-deploy-runbook.md) §8. **SUPERSEDED:** the planned "dry-run *rolling* deploy" — there is no rolling deploy under plain Compose.

## References
- Second opinion: GPT-5.6-sol advisory (topology pressure-test, bundle recommendation, seeding security finding, footgun list).
- EF Core: [applying migrations](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying), [data seeding](https://learn.microsoft.com/en-us/ef/core/modeling/data-seeding).
- Dokploy: [zero-downtime](https://docs.dokploy.com/docs/core/applications/zero-downtime) (Swarm rolling; requires a health route; Compose alone cannot do zero-downtime).
