# Production Deploy Runbook

This runbook is the operational source of truth for database migration gating. The first-deploy
operator record says the live Dokploy log reported `Compose Type: docker-compose`; that is a
live-server observation, not a mode encoded by this repository.
Compose applies `deploy.restart_policy` when it is present and falls back to the service-level
`restart:` field only when it is absent. The migrator sets both controls to no restart, and an
unhealthy container remains running rather than being rescheduled.

> **ORG MOVE (2026-08-25, #1362):** GHCR packages did NOT move with the repository. Images already
> deployed from `ghcr.io/radandevist/publyapp/*` keep working. After the first `deploy-images` run
> under the `PublyApp` organization, repoint Dokploy to the four new image names
> (`ghcr.io/publyapp/publyapp/{api,migrate,front}`, the worker reusing `api`) and give Dokploy's
> GHCR credential a token with **org-level `read:packages`** scope — the org `api` and `migrate`
> packages are private.

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
- Confirm `SOCIAL_ACCOUNTS_MASTER_KEY` is set for `api`, `worker`, and `migrate` (one generated `openssl rand -base64 32` value shared by all three; a missing or divergent value refuses to boot them). The committed all-zero base64 string is the build/e2e placeholder only — never a deployable value. Since #1294 the api/worker boot refuses the placeholder outright, along with any degenerate value (all 32 bytes identical, or fewer than 16 distinct byte values across the 32), with a plain-words startup error naming the reason — paste a genuinely generated key, not a hand-copied pattern.
- Confirm `PUBLIC_ORIGIN` is set for `publyapp-front` — the front SSR handler refuses to start in
  production without it, because an unset value lets the server trust the client's `Host` header
  when building canonical and Open Graph URLs (host-header injection). Set it to the public https
  origin with no trailing path (for example `https://app.publy.example`). Never inline a `#` in a
  Dokploy secret value: a `#` silently truncates everything from the first `#` onward — this
  deployment's first release silently truncated a secret there.
- Confirm the migration service joins a network that resolves and reaches PostgreSQL.
- Confirm the upload budget variables (`UPLOAD_GLOBAL_MAX_BYTES`, `UPLOAD_PER_STAFF_MAX_BYTES`,
  `UPLOAD_ORPHAN_GRACE_DAYS`) are set for `api` and `worker` (safe defaults apply when omitted;
  semantics: [`guides/uploads.md`](../guides/uploads.md)).
- Confirm `RATE_LIMIT_COUNTER_STORE` is left at its `postgres` default for every replica of
  `api`/`worker` (#953): all replicas must share one fleet-wide rate-limit budget per partition.
  `memory` is a single-replica incident lever only — running it while more than one replica
  serves traffic multiplies every limit by the replica count silently. Semantics:
  [`guides/api-rate-limiting.md`](../guides/api-rate-limiting.md) §Counter storage.
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

## Social accounts master key (`SOCIAL_ACCOUNTS_MASTER_KEY`) and the boot canary

`SOCIAL_ACCOUNTS_MASTER_KEY` (32 bytes, `openssl rand -base64 32`) must be set as a Dokploy
secret on **all three** services — `publyapp-api`, `publyapp-worker`, and `publyapp-migrate`
— with the **same value**. It protects the Data Protection key ring persisted to Postgres,
which encrypts every stored social credential. A value present but wrong-sized or wrong
refuses the api/worker boot with a plain-words cause; it does not fail silently.

At every real boot of `publyapp-api` and `publyapp-worker`, the startup witness decrypts a
canary blob persisted beside that key ring (row `social-accounts-master-key-canary` in
`data_protection_keys`). On success it logs exactly one Information line stating the canary
PASSED (#1284); on mismatch it refuses to start and names the recovery options. When watching
a deploy, treat that PASSED line as the positive proof the key works — its absence means the
boot was refused earlier, not that everything is fine.

If a database infrastructure failure hits that check (`#1424`), the boot refuses with a
plain-words cause instead of a raw driver stack trace. The cause names WHICH failure
happened, because the right next action differs:

- Postgres did not answer (connection refused, timeout, broken connection):

  > cannot reach the database at `<host>:<port>`: *driver reason* — the master-key check
  > could not run; the API will not start. Verify the database container/service is running
  > and reachable from this service, then restart.

- Postgres answered but has no `data_protection_keys` table yet (SqlState `42P01`). This is
  NOT a connectivity problem, and it is production-reachable at deploy time: `dokploy.yml`
  declares no `depends_on`, so api/worker/migrate start concurrently, only the worker graph
  waits for pending migrations, and the api's canary runs immediately at boot — so on a
  first deploy the api can reach the database while the one-shot migrator is still working:

  > the master-key canary table is missing — database migrations have not been applied yet
  > (SqlState `42P01`: …). The database at `<host>:<port>` answered, so it is reachable —
  > the schema simply does not exist yet; the master-key check could not run and the API
  > will not start. Wait for the one-shot migrate task (`publyapp-migrate`) to finish and
  > restart this service; inspect its logs if it did not succeed.

  The correct action here is the deployment checklist's own line: watch the
  `publyapp-migrate` container to a zero exit and inspect its logs on non-zero exit — do
  not chase reachability for a database that demonstrably answers.

- Postgres answered and rejected the canary statement with any other server-side error:
  the refusal quotes its SqlState and message text under "the database rejected the
  master-key canary check", naming what came back instead of an unreachable claim.

Every variant names only the endpoint, never the credentials in the connection string (a
server that answers quotes the username in errors like 28P01; the refusal redacts it). The
key check reruns automatically on the next boot.

One deliberate exception: the build-time OpenAPI generation inside `dotnet build`
(`just build-api` / `just generate-client`) runs this app's `Main` **without a database**, so
the canary is skipped there by design — only the key parse/size contract runs, and no PASSED
line is logged. A green CI build therefore never exercises the canary; only a real api/worker
boot does. Full guide: [`docs/guides/social-accounts.md`](../guides/social-accounts.md).

### The boot-log probe argument is test-only (#1319)

The shipped image also carries a hidden test hook, `--emit-canary-boot-log`, which makes the
process dump the boot's captured log lines after the canary gate and exit **without starting
any host** (no HTTP socket, no job engine). It is guarded: without the environment variable
`PUBLYAPP_TEST_BOOT_PROBE` set to exactly `1` or `true`, the process refuses to start with
exit code **78** and prints a plain-words cause naming the variable.

For operators:

- Never add `--emit-canary-boot-log` to a container `command:` (Dokploy, compose,
  Dockerfile CMD). A misconfigured command now dies loudly with exit 78 and the message
  above — it does not fail silently.
- Never set `PUBLYAPP_TEST_BOOT_PROBE` in any deployed service's environment. It exists
  only for the API integration suite, which spawns the image locally under Testcontainers.
- If you see the refusal in logs, remove the stray argument from that service's command;
  nothing else needs to change.

### Duplicate canary rows: cause and one-off repair (#1416, incident 2026-08-25)

On the 2026-08-25 deployment whose canary row did not exist yet, `publyapp-api` and
`publyapp-worker` booted together against an empty canary: every process read null,
every process inserted its own `social-accounts-master-key-canary` row into
`data_protection_keys`, and every LATER boot then died in the canary read with
`Sequence contains more than one element`, crash-looping both services.

Since migration `AddCanaryFriendlyNameUniqueIndex` this cannot recur: the migration
first deduplicates existing rows (it keeps the LOWEST `"Id"` — the row earlier boots
verified under) and then enforces a unique partial index
(`ux_data_protection_keys_canary_friendly_name`) filtered to the canary name only.
Ordinary Data Protection key-ring rows are unaffected. If a database ever carries
duplicates again anyway, the boot fails naming the duplicate count and the action
below instead of the bare LINQ error.

Manual repair (only when the migration cannot run): keep the lowest-id canary row,
delete the rest —

```sql
DELETE FROM data_protection_keys
WHERE "FriendlyName" = 'social-accounts-master-key-canary'
  AND "Id" <> (
      SELECT MIN("Id") FROM data_protection_keys
      WHERE "FriendlyName" = 'social-accounts-master-key-canary'
  );
```

Every duplicate row was minted under the SAME `SOCIAL_ACCOUNTS_MASTER_KEY`, so the
lowest-id survivor verifies; after the delete, restart `api`/`worker` and confirm the
single PASSED canary log line described above.

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
