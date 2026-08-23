# Production Deploy Runbook

This runbook is the operational source of truth for database migration gating. The first-deploy
operator record says the live Dokploy log reported `Compose Type: docker-compose`; that is a
live-server observation, not a mode encoded by this repository.
Compose applies `deploy.restart_policy` when it is present and falls back to the service-level
`restart:` field only when it is absent. The migrator sets both controls to no restart, and an
unhealthy container remains running rather than being rescheduled.

## Ratified approach A: one-shot migrate plus application gates

Every release uses one immutable `RELEASE_TAG`. It tags **three** published images — `api`,
`migrate`, and `front` — which back **four** services: the worker runs the **same `api` image**
with `APP_ROLE=worker`, so there is no separate worker image. `dokploy.yml` declares
`publyapp-migrate` as a one-shot Compose service using the slim EF bundle image. Its
paired no-restart declarations leave it stopped after the bundle exits; operators inspect that
exited container and its logs.

Dokploy starts the services concurrently. Ordering therefore comes from application readiness
plus a five-minute health grace matching the migration-gate budget, not Compose dependencies:

1. `publyapp-migrate` runs the EF bundle and exits zero after migrations and production-safe
   seeding complete. A non-zero exit remains visible as an exited Compose container.
2. `publyapp-api` exposes liveness at `GET /health/live` and migration-gated readiness at
   `GET /health/ready` (`GET /health` remains a readiness alias). Its container healthcheck
   probes readiness with a five-minute `start_period`. Compose does not kill an unhealthy
   container; health-gated routing leaves it unrouted while migrations and production-safe
   seeding run. Readiness changes from 503 to 200 only after its configured `AppDbContext` can
   reach PostgreSQL and has no pending migrations.
3. `publyapp-worker` starts its migration gate before any queue processor, listener,
   scheduler, monitor, or heartbeat service. The gate refreshes the heartbeat file while it
   retries every two seconds for up to five minutes, so liveness remains healthy while job
   processing is blocked. On timeout, host startup still fails visibly instead of hanging forever.
4. `publyapp-front` reports health through `GET /health`.

The worker heartbeat file and `--worker-health` command remain liveness checks; the gate writes
the heartbeat during its bounded migration wait, and the regular heartbeat service takes over
after startup. They do not replace the migration gate. The migrate bundle does not wait on itself;
its image entrypoint is the bundle directly.

In the plain-Compose runtime observed on the live server, unhealthy containers are not killed or
rescheduled.
`/health/ready` remains 503, so health-gated routing keeps the API out of service while the failed
or stuck migration is investigated. The migration container remains exited after either a zero or
non-zero exit because its restart policy is `no`.

`dokploy.yml` carries both `deploy.restart_policy.condition: none` and `restart: "no"` for the
migration service. Compose gives the deploy restart policy precedence; the service-level field is
the equivalent fallback if that policy is absent. Both declarations therefore preserve the same
one-shot, no-restart behavior.

### Deploy checklist

Before triggering the stack deployment:

- Confirm the release workflow published all three images (`api`, `migrate`, `front`) with the
  same immutable tag. The worker reuses the `api` image, so there is no fourth image to check.
- Set `RELEASE_TAG` and the complete environment/secret set in Dokploy. API and migrator
  share the single database credential; API and worker pool caps remain 50 and 30.
- Confirm `TRUSTED_PROXY_CIDRS` is set and is **Traefik's exact address as `/32`** (or `/128` for
  IPv6) — not a network CIDR. `docker inspect` reports a container address with the network prefix
  (e.g. `10.0.1.9/24`); pasting that verbatim trusts every peer container on `dokploy-network` and
  lets any of them forge `X-Forwarded-For`. Universal CIDRs (`0.0.0.0/0`, `::/0`) are rejected at
  startup, and a **missing** value fails the Production `api` role at startup — a real deploy
  crash-looped on this. Recheck the address after any Traefik or network recreation, and make sure
  the value contains no `#` (this deployment's first release silently truncated a secret there).
  This is observed project behaviour, not a vendor-documentation claim. Full note:
  [`first-deploy-runbook.md`](first-deploy-runbook.md) §5a.
- Confirm `SOCIAL_ACCOUNTS_MASTER_KEY` is set for `api`, `worker`, and `migrate` (one generated `openssl rand -base64 32` value shared by all three; a missing or divergent value refuses to boot them). The committed all-zero base64 string is the build/e2e placeholder only — never a deployable value.
- Confirm the migration service joins a network that resolves and reaches PostgreSQL.
- Confirm the persistent API storage volume is mounted and writable by the runtime UID.

During deployment:

- Watch the `publyapp-migrate` container to a zero exit. Inspect its logs on non-zero exit.
- Confirm the API container remains alive but not ready/routed while a migration is pending, then
  becomes ready after the migration container succeeds.
- Confirm the worker logs the bounded wait when necessary, then produces a fresh heartbeat
  throughout the wait and begins job processing only after migrations are applied.
- Confirm the front `/health` check passes before routing production traffic.

If migration fails, do not force readiness or run the application against a partially
migrated schema. Preserve the container logs, correct the migration or configuration, publish a
new immutable release, and redeploy. Production migrations remain expand/contract only;
rollback prefers a backward-compatible forward fix and backup restore over automatic
`Down()` execution.

## Alternative B: CI pipeline gate

CI can run the immutable migrator image on the VPS and check its process exit code before
triggering the Dokploy deploy webhook/API. SSH is the reliable execution path. A Dokploy
server Schedule Job can start a container, but its API has no documented status/log result,
so it is not a dependable success gate without additional SSH polling.

This alternative requires VPS SSH credentials or a suitably scoped Dokploy API key in CI,
host-side GHCR authentication, the database network name, and explicit sequencing
so Dokploy is triggered only after a zero migration exit.

## Alternative C: manual SSH two-step

For an operator-controlled deployment, SSH to the VPS, pull and run the immutable migrator
image on the database network, verify a zero exit and logs, and only then trigger the
Dokploy deployment. This works without Dokploy lifecycle hooks but relies on manual
discipline, so it is an interim/fallback procedure rather than the default.

## Production-instance checks — RESOLVED (first deploy, 2026-07-20)

These were open before the first real deployment. They are now answered on the live VPS. The
click-by-click procedure and the traps encountered live in
[`first-deploy-runbook.md`](first-deploy-runbook.md).

- **Compose vs Swarm** — the operator record says the live deploy log reported
  `Compose Type: docker-compose`; the repository does not encode that Dokploy selection. Compose gives
  `deploy.restart_policy` precedence and falls back to `restart:` only when it is absent; an
  unhealthy container is not killed or rescheduled, it simply stays running and unrouted. The
  one-shot migrate service carries both equivalent no-restart declarations.
- **GHCR credentials** — configured once in Dokploy Settings → Registry; the host pulls the
  private images successfully. No credentials are stored in this repo.
- **The Docker network** — the repository declares `dokploy-network` by name, joined by every
  service as `external: true`; it does not declare that external network's driver. Live-server
  inspection confirmed that the managed PostgreSQL was reachable on the named network, so this is
  what the migration service must join to resolve and reach the database.
  **Note:** joining the right network is necessary but not sufficient — the managed database's
  hostname carries a Dokploy-generated suffix and is **not** the App Name you typed. Take it
  from the Postgres service's Connection tab → Internal Host, or the migration container fails DNS
  resolution before it applies anything.

If alternative B is pursued later, also confirm whether `schedule.runManually` blocks or is
fire-and-forget and provision the least-privileged API key needed for schedule/deploy calls.
