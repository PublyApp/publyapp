# Production Deploy Runbook

This runbook is the operational source of truth for database migration gating on the
Dokploy Compose/Swarm deployment. Dokploy has no native pre-deploy hook for Compose/Swarm
applications, and Swarm ignores Compose `depends_on`. The owner ratified approach A below.

## Ratified approach A: one-shot migrate plus application gates

Every release uses one immutable `RELEASE_TAG` for the API, worker, migrator, and front
images. `dokploy.yml` declares `publyapp-migrate` as a normal service using the slim EF
bundle image. Its Swarm restart policy is `condition: none`, so the release-tag update
creates one migration task and Swarm does not restart it after it exits.

Dokploy starts the services concurrently. Ordering therefore comes from application
readiness plus a startup grace period longer than the migration budget, not Compose dependencies:

1. `publyapp-migrate` runs the EF bundle and exits zero after migrations and production-safe
   seeding complete. A non-zero exit remains visible as a failed Swarm task.
2. `publyapp-api` exposes liveness at `GET /health/live` and migration-gated readiness at
   `GET /health/ready` (`GET /health` remains a readiness alias). Its container healthcheck
   probes readiness with a five-minute `start_period`, keeping the task alive-but-unrouted while
   migrations and production-safe seeding run. Readiness changes from 503 to 200 only after its
   configured `AppDbContext` can reach PostgreSQL and has no pending migrations.
3. `publyapp-worker` starts its migration gate before any queue processor, listener,
   scheduler, monitor, or heartbeat service. The gate refreshes the heartbeat file while it
   retries every two seconds for up to five minutes, so liveness remains healthy while job
   processing is blocked. On timeout, host startup still fails visibly instead of hanging forever.
4. `publyapp-front` reports health through `GET /health`.

The worker heartbeat file and `--worker-health` command remain liveness checks; the gate writes
the heartbeat during its bounded migration wait, and the regular heartbeat service takes over
after startup. They do not replace the migration gate. The migrate bundle does not wait on itself;
its image entrypoint is the bundle directly.

Under Swarm, the five-minute `start_period` prevents readiness failures from counting toward the
task-kill threshold while health-gated routing keeps the API task out of service. A migration that
fails or exceeds that budget produces a visible failed/rescheduled task. Under plain Compose,
unhealthy containers are not killed; `/health/ready` remains 503 and can gate any consumer using
`depends_on: condition: service_healthy`. The installed Dokploy version's actual Swarm-versus-plain-
Compose behavior remains an open production-instance check, but the configuration is safe in both.

### Deploy checklist

Before triggering the stack deployment:

- Confirm the release workflow published all four images with the same immutable tag.
- Set `RELEASE_TAG` and the complete environment/secret set in Dokploy. API and migrator
  share the single database credential; API and worker pool caps remain 50 and 30.
- Confirm the migration task joins a network that resolves and reaches PostgreSQL.
- Confirm the persistent API storage volume is mounted and writable by the runtime UID.

During deployment:

- Watch the `publyapp-migrate` task to a zero exit. Inspect its logs on non-zero exit.
- Confirm new API tasks remain alive but not ready/routed while a migration is pending, then become
  ready after the migration task succeeds.
- Confirm the worker logs the bounded wait when necessary, then produces a fresh heartbeat
  throughout the wait and begins job processing only after migrations are applied.
- Confirm the front `/health` check passes before routing production traffic.

If migration fails, do not force readiness or run the application against a partially
migrated schema. Preserve the task logs, correct the migration or configuration, publish a
new immutable release, and redeploy. Production migrations remain expand/contract only;
rollback prefers a backward-compatible forward fix and backup restore over automatic
`Down()` execution.

## Alternative B: CI pipeline gate

CI can run the immutable migrator image on the VPS and check its process exit code before
triggering the Dokploy deploy webhook/API. SSH is the reliable execution path. A Dokploy
server Schedule Job can start a container, but its API has no documented status/log result,
so it is not a dependable success gate without additional SSH polling.

This alternative requires VPS SSH credentials or a suitably scoped Dokploy API key in CI,
host-side GHCR authentication, the database overlay network name, and explicit sequencing
so Dokploy is triggered only after a zero migration exit.

## Alternative C: manual SSH two-step

For an operator-controlled deployment, SSH to the VPS, pull and run the immutable migrator
image on the database network, verify a zero exit and logs, and only then trigger the
Dokploy stack deployment. This works without Dokploy lifecycle hooks but relies on manual
discipline, so it is an interim/fallback procedure rather than the default.

## Open production-instance checks

Operations must confirm these on the real VPS before the first deployment:

- The installed Dokploy version and the actual Compose/Swarm behavior it exposes.
- Whether the VPS host Docker daemon already has GHCR pull credentials; otherwise perform
  an operator-managed `docker login ghcr.io` without storing credentials in this repo.
- The exact overlay network the migration task must join to resolve and reach PostgreSQL;
  update the Dokploy network attachment after discovering the instance-specific name.

If alternative B is pursued later, also confirm whether `schedule.runManually` blocks or is
fire-and-forget and provision the least-privileged API key needed for schedule/deploy calls.
