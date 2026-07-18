# Production Deployment & Migration Design

**Issue:** #876 · **Status:** approved design, pending implementation · **CI-guard follow-up:** #877

PublyApp has never been deployed — there is no production or staging environment yet, and the migration strategy was undecided. This document is the authoritative decision record for how PublyApp deploys to production and applies database migrations. It supersedes the older `docs/misc/deployment-guide.md` (artifact-upload flow) and `docs/misc/database-migration-deployment.md` (generic/stale, references SQL Server `sqlcmd` and a DbContext class that no longer exists).

Target host: **Dokploy on a single Hostinger VPS**, GHCR images, Traefik SSL. Grounded in `dokploy.yml` + `apps/api/Dockerfile` as they stand, plus a second architectural opinion (GPT-5.6-sol) captured during design.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Process topology | **Split** — separate `api`, `worker`, and `front` services (not a combined `APP_ROLE=all`) |
| 2 | Migration mechanism | **Apply directly** (automated), packaged as an **EF migration bundle** (no SDK/source in prod) |
| 3 | Migration execution | **Dokploy pre-deploy command** running the bundle once before the rolling update (aborts deploy on failure) |
| 4 | Seeding | **Split by intent** — essentials idempotent everywhere, demo gated OFF in Production, owner via bootstrap |
| 5 | Deploy model | **Zero-downtime** — Swarm rolling + **expand/contract** (backward-compatible) migration discipline |
| 6 | DB credentials | **Single** app credential (migrator + runtime share one role) |
| 7 | Frontend target | **`apps/front-2`** (SSR), deployed under a generic service name to absorb the future front/front-2 rename |

### Why these (rationale)
- **Split (1):** builds the target topology from day one; `APP_ROLE=all` remains a valid fallback. Split gives process/operational isolation. It is only worse than combined if the VPS OOMs/swaps or connection pools are uncapped — both mitigated below.
- **Bundle (2):** same automated "apply-directly" behaviour as `dotnet ef database update`, but ships a ~200 MB purpose-built migrator with **no .NET SDK, no EF tooling, and no source code** in production (the current `migrate` Dockerfile stage is SDK-based, ~800 MB, and carries source). The bundle takes EF's migration lock and still runs `UseSeeding`.
- **Pre-deploy command (3):** the earlier idea of an in-compose `migrate` service gated by `depends_on: service_completed_successfully` is **Compose-only** — Docker **Swarm ignores `depends_on`**, and Dokploy's zero-downtime uses Swarm. So migrations run as a pre-deploy step, then the services roll. Fails closed: a failed migration aborts the deploy.
- **Seeding split (4):** the current seeders run unconditionally on migrate and mix **essential** data (permission catalog, real owner) with **demo fixtures** (Acme tenant; Alice/Charlie/Acme users seeded with a *source-controlled known password*). Shipping the demo fixtures to prod is a **first-deploy security hole**, not just clutter.
- **Zero-downtime + expand/contract (5):** owner chose zero-downtime. It has two halves: **schema safety** (expand/contract — always ours to control) and **deploy mechanics** (Swarm rolling on Dokploy). Expand/contract is the real guarantee; rolling delivers no-gap cutover.
- **Single credential (6):** least-privilege DDL/DML split is deferred; pre-launch, the split's default-privileges management is a self-inflicted-outage risk with low marginal benefit. Revisit at/near launch.
- **front-2 (7):** front-2 is the go-forward UI. Deploying it now (under a generic service name) means the eventual rename (`front` → `old-front`, `front-2` → `front`) is a source/image swap with no deploy-layer churn.

## Target architecture

One immutable release tag per deploy → **migrate (pre-deploy)** → **api + worker + front** roll in with zero downtime.

| Service | `APP_ROLE` | Health check | Public (Traefik) |
|---------|-----------|--------------|------------------|
| **migrate** (EF bundle, one-shot pre-deploy) | `api` | process exit code (non-zero aborts deploy) | — |
| **api** | `api` | `GET /health` | `api.publyapp.com` |
| **worker** | `worker` | `--worker-health` CLI (no HTTP surface) | — |
| **front** (front-2 SSR, service name `publyapp-front`) | — | `GET /health` | `publyapp.com`, `www.publyapp.com` |

Deploy flow:
1. CI builds and pushes immutable-tagged images (`…:<release>`), including the migrator-bundle image.
2. Dokploy **pre-deploy command** runs the migrator bundle once (`APP_ROLE=api`, full env). Non-zero exit aborts the deploy — nothing rolls against a failed migration.
3. Dokploy rolls **api**, **worker**, **front** as Swarm services: new container starts → health check passes → Traefik reroutes → old container drains.
4. The **worker's** brief two-instance overlap during a roll is safe by design: 2B's fenced leases + advisory-lock scheduler leadership + ~45s graceful drain prevent double-execution.

## Migrations
- **Bundle** built in CI (`dotnet ef migrations bundle`, target the VPS runtime), shipped in a slim image; run by the pre-deploy step. Runs `UseSeeding` (gated — see below).
- **Expand/contract discipline:** no breaking schema change in a single release; destructive changes split across two releases (expand → deploy code using both → contract later). Enforced now by **policy + PR checklist**; automated **CI guard is issue #877** (fast-follow — do not forget).
- **Single DB credential** shared by migrator + runtime.
- **Rollback:** prefer backward-compatible forward migrations + backups + forward fixes. Do **not** rely on automatic `Down()` in production (it can destroy newly-written data).

## Seeding
- **Essential** (permission catalog, required system profiles, scheduler/system-job definitions): run in **every** environment, idempotent (stable-key upsert). May stay attached to the migrate step. Must be safely repeatable — `UseSeeding` runs even when no migration is pending.
- **Demo fixtures** (Acme tenant; Alice/Charlie/Acme users; known-password accounts): **Development/Testing only**, with a **test that asserts they are excluded in Production**.
- **Owner:** provisioned via the `STAFF_OWNER_*` bootstrap flow, **not** the demo seeder path. (Confirm the bootstrap does not itself rely on a known/committed password.)

## Config, secrets, resources
- **Full `AppEnvironment` variable set** must be supplied to `api`, `worker`, and `migrate` — configuration validation is monolithic (`AppEnvironment.Initialize()`), so a missing var fails the process fast. Today `dokploy.yml` supplies only two. Secrets live in Dokploy's env management, never committed.
- **`APP_ROLE`** is required in Production (from 2B): `api`/`migrate` → `api`, `worker` → `worker`.
- **Connection pool caps** per role so `api` + `worker` + scheduler-leadership + LISTEN/NOTIFY connections stay under Postgres `max_connections` with an admin reserve. Start: **api `MaxPoolSize=50`, worker `MaxPoolSize=30`** against default `max_connections=100`; tune under load.
- **Immutable release tags** for every service (api, worker, front, migrate) — never `latest`.
- Keep worker concurrency/batch sizes conservative so a queue burst cannot starve HTTP or Postgres on the shared host.

## Fixes to current config (first-deploy footguns)
Independent of the jobs work — these would break deploy #1 today:
- `dokploy.yml`: supply the **full env set** (only 2 vars today → instant fail-fast); fix the **healthcheck `curl` vs Dockerfile `wget`** mismatch (API healthcheck can never pass as-is); **drop fixed `container_name`** (blocks rolling replicas); make **front depend on API *health*, not startup**; pin **immutable tags**.
- Mark the two stale `docs/misc/` deployment docs as superseded (link here).

## Sequencing & dependencies
- This design **depends on 2B** (it introduces `APP_ROLE` + the worker composition root). **Approving this design is what unblocks merging 2B → 2C → P3** — the work #876 was gating.
- Implementation order: land 2B/2C/P3 → then wire deploy config (per-service Dokploy Applications), the CI **bundle** build, the **pre-deploy** hook, the **seeding gate** + Production-exclusion test, the **env/secret** set, **pool caps**, **immutable tags**, and the footgun fixes.
- front-2 deployability items: add a `/health` route; confirm its Dockerfile + production env set.

## Non-goals / deferred (tracked)
- **Least-privilege DDL/DML credential split** — revisit at/near launch (decision 6).
- **Automated expand/contract CI guard** — **issue #877** (fast-follow).
- **Blue/green / multi-replica horizontal scale** — the split topology and immutable tags keep the door open; not needed pre-launch.

## Verification
- Local `docker compose` smoke: migrate (bundle) → api + worker come up healthy with the full env; api `/health` and worker `--worker-health` pass.
- A spec asserting **demo seeders do not run under `ASPNETCORE_ENVIRONMENT=Production`** and essentials do.
- A dry-run rolling deploy on Dokploy (health-gated cutover, no 502s) before first real launch.

## References
- Second opinion: GPT-5.6-sol advisory (topology pressure-test, bundle recommendation, seeding security finding, footgun list).
- EF Core: [applying migrations](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying), [data seeding](https://learn.microsoft.com/en-us/ef/core/modeling/data-seeding).
- Dokploy: [zero-downtime](https://docs.dokploy.com/docs/core/applications/zero-downtime) (Swarm rolling; requires a health route; Compose alone cannot do zero-downtime).
