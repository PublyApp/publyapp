# PublyApp — First Production Deploy Runbook (Dokploy + managed Postgres)

Step-by-step operator guide for deploying to Dokploy (Hostinger VPS) with a
**Dokploy-managed PostgreSQL** database.

**Companion docs — read in this order:**

- [`production-deployment-design.md`](production-deployment-design.md) — why the deployment is
  shaped this way.
- [`production-deploy-runbook.md`](production-deploy-runbook.md) — the **migration-gating
  strategy** (ratified approach A, plus alternatives B/C) and the release checklist.
- **This file** — the concrete click-by-click first deploy, and the traps that actually bit.

Everything here was **walked end to end on the real instance (first successful deploy,
2026-07-20)**; the notes below record what was verified rather than what was assumed. Each
numbered trap cost real debugging time — they are written down so the next deploy does not
pay for them twice.

> **Three facts that shape everything below** (from research):
>
> 1. On this live server, the first-deploy log reported `Compose Type: docker-compose`. That selected
> Dokploy mode is an operator observation, not a setting stored in this repository; Dokploy supports
> separate Docker Compose and Stack/Swarm configuration methods. Compose applies
> `deploy.restart_policy` when present and falls back to `restart:` only when that policy is absent.
> Both migrator declarations say not to restart; an unhealthy container is **not** restarted or
> killed — it just stays running and Traefik withholds routing until it's healthy.
> 2. A Dokploy-managed database sits on the shared **`dokploy-network`**. A Compose app gets its **own** network by default and must **explicitly join `dokploy-network`** to reach the DB. This is the #1 thing that breaks a first deploy — **the committed `dokploy.yml` already does this** (all services are on `dokploy-network`, and nothing else).
> 3. Traefik routing is **not** configured by labels in the compose file. You add each domain in Dokploy's **Domains tab**, and Dokploy generates the real `traefik.*` labels (including pinning the container's network to `dokploy-network`). So domain setup is a UI step, not a file edit — see §4.5.

---

## 0. Prerequisites

- Dokploy installed and reachable (admin UI), on the VPS.
- The app images exist in GHCR — CI (`.github/workflows/deploy-images.yml`) builds and pushes
  `ghcr.io/publyapp/publyapp/{api,migrate,front}` tagged by commit SHA on push to the
  target branch. Pick the SHA tag you want to deploy (that becomes `RELEASE_TAG`).
  If Actions is billing-stalled, first run `docker login ghcr.io -u <your-github-user>`, then run
  `just deploy-images [ref]` locally (the ref defaults to `origin/develop`), or invoke
  `node packages/scripts-ts/src/deploy-images.ts [ref]` directly. The wrapper mirrors the workflow's three builds
  and pushes, using a pristine detached git worktree at the resolved commit rather than the current
  working tree. Copy its final `RELEASE_TAG=<full-SHA>` into Dokploy.
  > ⚠️ **ORG MOVE (2026-08-25, #1362):** GHCR packages did NOT move with the repository. Images
  > published before the move still live under `ghcr.io/radandevist/publyapp/*` and keep working.
  > After the first successful `deploy-images` run under the `PublyApp` organization, deploy from
  > the new names and refresh the §2 registry credential with a classic PAT carrying
  > **org-level `read:packages`** scope — the new org `api` and `migrate` packages are private.
- A GitHub **classic PAT** with `read:packages` (and `write:packages`) scope, for GHCR pulls.
- A domain (or subdomain) pointed at the VPS for the front + api, if you want HTTPS via Traefik.

---

## 1. Config prep — none needed; the committed `dokploy.yml` is deploy-ready

The compose file is already set up for the declared **Dokploy-managed Postgres** topology and for
the plain-Compose behavior recorded on the live server (this is what PR #892 landed). The selected
Dokploy mode itself lives outside the repository. You do **not** need to hand-edit the file:

- All four services (`publyapp-api`, `publyapp-worker`, `publyapp-migrate`, `publyapp-front`)
  are on **`dokploy-network` only** — so they reach the managed DB and Traefik can route to
  them, with no multi-network ambiguity.
- The one-shot migrate service carries `deploy.restart_policy.condition: none` and the equivalent
  `restart: "no"` fallback. Compose gives the deploy policy precedence when present, so the
  declarations agree and it runs exactly once per deploy.
- There are **no routing labels** in the file on purpose — routing is configured in the
  Domains tab (§4.5).

**One thing to get right at create time:** do **NOT** enable "Isolated Deployments" on this
compose app (a known Dokploy issue can then block DB reachability even on `dokploy-network`).

---

## 2. Configure GHCR registry auth (Dokploy → Settings → Registry)

Add a registry: **URL** `ghcr.io`, **Username** = your GitHub username, **Password** = the PAT.
Click **Test**, then **Create**. This runs `docker login ghcr.io` on the host so any app can
pull the private images.

- **[CONFIRM ON INSTANCE]** after saving, SSH to the VPS and check `cat ~/.docker/config.json`
  has a `ghcr.io` entry. If missing, run manually:
  `echo <PAT> | docker login ghcr.io -u <github-user> --password-stdin`.

---

## 3. Create the managed Postgres (Dokploy → your project → Add Service → PostgreSQL)

- **Name**: friendly (e.g. "publyapp-db").
- **App Name**: e.g. `publyapp-postgres`.
  > ⚠️ **TRAP — the App Name is NOT the hostname.** Dokploy appends a random suffix to the
  > name you type, so the real internal hostname ends up like `publyapp-postgres-a1b2c3`.
  > Using the App Name verbatim in the connection string gives a **DNS failure**
  > (`SocketException (11)` out of `Dns.GetHostAddresses`), which surfaces as
  > "Database is unreachable" in the api and a migrate service that dies before applying
  > anything — so the schema and the owner account are never created and every DB-backed
  > request (login included) 500s.
  >
  > **Always take the hostname from the Postgres service's Connection tab → "Internal Host",
  > never from the App Name field you typed.**
- **Docker Image**: pin a version, e.g. `postgres:18` (match dev; do not leave `:latest`).
- **Database Name / User / Password**: set and record them.
- Deploy it. Open its **Connection** tab and copy **Internal Host** verbatim (this is the
  suffixed name — the value your connection string needs) and **Internal Port** (5432). Do
  **not** assign an External Port (keep it private).
- Persistence: Dokploy auto-creates the data volume — data survives redeploys. Backups are
  opt-in (configure an S3 target later if you want them).

---

## 4. Create the Compose application (Dokploy → project → Add Service → Docker Compose)

- **Compose Type**: **Docker Compose** (NOT "Stack"). This is permanent — chosen once.
- **Provider**: point at the Git repo + path to `dokploy.yml` (or paste the file). Pick the
  branch/commit whose SHA you'll use as `RELEASE_TAG`.
- Leave **Isolated Deployments OFF**.

---

## 4.5. Configure the domains (Compose app → Domains tab) — this is what wires HTTPS routing

Because the compose file carries **no** routing labels, Traefik only routes once you add the
domains here. Dokploy turns each entry into the real `traefik.*` labels (and pins the network
to `dokploy-network`). Add two:

| Host                                        | Service          | Container Port | HTTPS              |
| ------------------------------------------- | ---------------- | -------------- | ------------------ |
| `api.yourdomain.com`                        | `publyapp-api`   | `5000`         | on (Let's Encrypt) |
| `yourdomain.com` (and `www.yourdomain.com`) | `publyapp-front` | `3000`         | on (Let's Encrypt) |

- **[CONFIRM ON INSTANCE]** after saving, open the app's **Preview Compose** (or inspect the
  running containers) and confirm each web service got `traefik.enable=true`, a router+service
  label, and **`traefik.docker.network=dokploy-network`**. If those are present, routing is wired.
- DNS: point the A records for those hosts at the VPS before (or right after) this, so
  Let's Encrypt can issue certs.

---

## 5. Set environment variables (Compose app → Environment tab)

Set these in Dokploy's Environment tab; the Compose file consumes them through `${VAR}`
interpolation.
**The app fails fast at startup on the _first_ missing REQUIRED var** (e.g.
`Environment variable 'DEFAULT_EMAIL_SENDER_EMAIL' is not set`), so every required var below
MUST be present or no container starts. Optional vars are safe to omit — the app falls back to
code defaults when they are blank.

### 5a. REQUIRED — deployment-specific (you provide the value)

| Variable                     | Value                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RELEASE_TAG`                | the GHCR image tag to deploy (the full commit SHA)                                                                                                                                                                                                                                                                                                                   |
| `APP_ROLE`                   | which process this container runs. One of `api` (HTTP surface + migrations + tooling), `worker` (background jobs), or `all` (both — **only safe in Development/Testing**). REQUIRED in production: a missing/blank value crash-loops the container at startup. The `api` and `worker` services MUST each pin their own role — never deploy `all` to production (it binds the HTTP port AND runs jobs in one process, competing with the scaled `api` replicas). |
| `POSTGRES_CONNECTION_STRING` | `Host=<internal-host>;Port=5432;Database=<db>;Username=<user>;Password=<pass>` — **Host = the Postgres service's Connection tab → "Internal Host"** (it has a Dokploy-generated suffix, e.g. `publyapp-postgres-a1b2c3`; the App Name you typed is NOT the hostname — see step 3). (The app appends `;MaxPoolSize=…` itself.)                                        |
| `STAFF_OWNER_EMAIL`          | the platform owner's login email                                                                                                                                                                                                                                                                                                                                     |
| `STAFF_OWNER_BOOTSTRAP_CODE` | strong secret — becomes the owner's **initial password** on first boot. **Avoid `#` in the value** (and any other env-file metacharacter): this project's first deployment observed a secret containing `#` silently truncated at that character. Nothing errored — login simply failed. Prefer long alphanumeric + `-_.` only. This is observed project behaviour, not a vendor-documentation claim; see §8. |
| `RESEND_API_KEY`             | your Resend API key (rotate the committed placeholder)                                                                                                                                                                                                                                                                                                               |
| `SOCIAL_ACCOUNTS_MASTER_KEY` | REQUIRED secret — generate once with `openssl rand -base64 32` (32 bytes, base64). Protects the Data Protection key ring, which protects every `social_accounts.protected_credentials` blob; a missing or wrong-value key crash-loops `api`, `worker`, AND `migrate` at startup (the master-key witness refuses to boot). The committed all-zero `AAAA…AAA=` value in the repo is the documented BUILD/e2e placeholder only (Dockerfile doc-gen stages, quality-gate.yml, justfile) — never deploy it. Avoid `#` in the value (§8). |
| `APP_NAME`                   | display/app name (e.g. `PublyApp`)                                                                                                                                                                                                                                                                                                                                   |
| `FRONT_URL`                  | public URL of the front (e.g. `https://publyapp.com`)                                                                                                                                                                                                                                                                                                                |
| `DEFAULT_EMAIL_SENDER_EMAIL` | the "from" address — must be a **Resend-verified** domain for mail to deliver (app still starts if not)                                                                                                                                                                                                                                                              |
| `TRUSTED_PROXY_CIDRS`        | Traefik's exact address(es), expressed as `/32` (IPv4) or `/128` (IPv6), or the CIDR of a dedicated proxy network joined **only** by Traefik and the API. **Do not paste what Docker reports.** `docker inspect` gives the container address with the **network** prefix (e.g. `10.0.1.9/24`) — pasting that verbatim trusts every peer container on the shared `dokploy-network`, and any of them could then forge `X-Forwarded-For`. Convert it to `/32`: `10.0.1.9/24` → `10.0.1.9/32`. Universal CIDRs (`0.0.0.0/0`, `::/0`) are rejected at startup, and a **missing** value fails the Production `api` role at startup — this crash-looped a real deploy. The value must contain **no `#`** because this deployment previously observed silent truncation at that character (trap 5 in §8); a truncated CIDR list fails validation or, worse, silently drops entries. Recheck exact addresses after any Traefik or network recreation. |
| `PUBLIC_ORIGIN`            | the front's public https origin (e.g. `https://app.publyapp.com`) — **no trailing slash**. REQUIRED in production: without it the front container crash-loops at startup (`PUBLIC_ORIGIN is required when NODE_ENV=production`) and never serves. The server refuses to trust the request Host header for canonical/Open Graph URLs in production. |
| `PUBLIC_API_BASE_URL`        | api's **public** URL, browser-facing (e.g. `https://api.publyapp.com`)                                                                                                                                                                                                                                                                                               |
| `VITE_ASP_SERVER_URL`        | same public api URL (baked into the browser bundle)                                                                                                                                                                                                                                                                                                                  |
| `SERVER_API_BASE_URL`        | server-to-server (front SSR → api). Use the internal `http://publyapp-api:5000` (both are on `dokploy-network`) — faster and doesn't need the public domain live                                                                                                                                                                                                     |

### 5b. REQUIRED — config (paste these values as-is; they match the app defaults)

```
DEFAULT_EMAIL_SENDER_NAME=PublyApp Support
SESSION_TOKEN_HEADER_KEY=X-Session-Token
TENANT_ID_HEADER_KEY=X-PublyApp-TenantId
SESSION_EXPIRY_DAYS=7
EMAIL_VERIFY_TOKEN_VALIDITY_DURATION=7
PASSWORD_RESET_TOKEN_VALIDITY_DURATION=7
PASSWORD_MIN_LENGTH=12
EMAIL_VERIFY_TOKEN_LENGTH=25
PASSWORD_RESET_TOKEN_LENGTH=25
INVITATION_TOKEN_LENGTH=32
```

### 5c. OPTIONAL — safe to omit (blank → code default). Set only to tune.

`PUBLIC_POSTHOG_PROJECT_TOKEN` (analytics), `DI_MANIFEST_ENABLED` (false), `AUDIT_LOG_EXPORT_MAX_ROWS`
(10000), `MAX_PROFILES_PER_USER` (5), `TENANT_USER_EXPORT_MAX_ROWS` (10000),
`TENANT_ACTIVITY_THROTTLE_MINUTES` (5), `FILE_STORAGE_ROOT` (.artifacts/storage),
`UPLOAD_MAX_BYTES` (2000000), `JOB_QUEUE_BATCH_SIZE` (20), `JOB_QUEUE_POLL_SECONDS` (5),
`ANON_AUTH_IP_RATE_LIMIT_PERMIT_LIMIT` (30), `ANON_AUTH_IP_RATE_LIMIT_WINDOW_SECONDS` (60),
`ANON_AUTH_EMAIL_RATE_LIMIT_PERMIT_LIMIT` (30),
`ANON_AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS` (60),
`PASSWORD_RESET_EMAIL_RATE_LIMIT_PERMIT_LIMIT` (3),
`PASSWORD_RESET_EMAIL_RATE_LIMIT_WINDOW_SECONDS` (900),
`JOB_LEASE_SECONDS` (300), `JOB_QUEUE_DRAIN_BUDGET_SECONDS` (60), `EMAIL_LOG_RETENTION_DAYS`
(180), `JOB_DEAD_LETTER_RETENTION_DAYS` (90), `EMAIL_PREPARED_SEND_RETENTION_DAYS` (7),
`EMAIL_PREPARED_SWEEP_MAX_LAG_MINUTES` (60), `SYSTEM_JOB_OCCURRENCE_RETENTION_DAYS` (30),
`JOB_ALERT_LEASE_RETENTION_DAYS`, `JOB_REGISTRY_DLQ_ORPHAN_ALLOWLIST`.

> **Source of truth:** the required vs optional split is enforced in `apps/api/Lib/AppEnvironment.cs`
> (`GetRequiredString`/`GetRequiredInt` = required; `GetOptional*` = has a default). The committed
> `.env.example` is a local-development starting template and matches the local Compose database.
> It is the only committed env file; `.env.development` is gitignored local state and must never be
> committed. A local `.env.production` may be an ignored, manually imported personal reference, but
> the application never consumes it. Deployed values come from the active PaaS configuration/secrets
> service — Dokploy's environment management for this deployment.

---

## 6. Deploy + watch

Click **Deploy**. In the deployment log you should see, in order:

1. Images pulled from GHCR.
2. **`publyapp-migrate`** starts, runs the EF bundle, applies all migrations + production
   seeding, and **exits 0** (it will show as "exited" — that is success, not failure).
3. `publyapp-api` / `publyapp-worker` start. The api reports **not-ready** (`/health/ready`
   = 503) and the worker waits at its startup gate **while migrate runs** — this is expected;
   they flip to healthy once migrations are applied. The 300s start-period covers this.
4. Once api `/health/ready` = 200 and worker heartbeat is fresh, Traefik begins routing.

If `publyapp-migrate` exits **non-zero**, the deploy is broken on purpose — read its log, fix,
redeploy. The api will stay not-ready (unrouted) until a successful migrate.

---

## 7. Verify

- `https://api.yourdomain.com/health/live` → 200 (process up).
- `https://api.yourdomain.com/health/ready` → 200 (migrations applied).
- Front loads at `FRONT_URL` (this only works once the domains from §4.5 are configured).
- **First owner login**: sign in with `STAFF_OWNER_EMAIL` + the `STAFF_OWNER_BOOTSTRAP_CODE`
  you set. (Recommended follow-up: change it immediately — a forced-rotation mechanism is a
  tracked non-blocking follow-up, not yet built.)
- Demo/sample data should be **absent** (demo seeders are gated off in Production).

---

## 8. Confirmed on the real instance (first deploy, 2026-07-20)

These were open questions in `production-deploy-runbook.md` → "Open production-instance
checks". They are now answered; that section is closed out.

- ✅ **Observed runtime was plain `docker compose`, NOT Swarm.** The live deploy log states:
  `Compose Type: docker-compose`. Compose gives `deploy.restart_policy` precedence and falls back
  to `restart:` only when it is absent; an unhealthy container is not killed, it just stays
  unrouted. Both forms are set to no restart on the migrate service.
- ✅ **Live-server inspection identified `dokploy-network` as an overlay network.** The repository
  proves only that all four services join the external network with that name; it does not declare
  the network driver. The managed Postgres was observed reachable there.
- ✅ **GHCR pull works** from the host once the registry is configured in Dokploy Settings.
- ✅ **Traefik routing comes from the Domains tab**, not compose labels. Adding a domain per
  web service is mandatory; without it Traefik has no router for the host and returns its
  default 404 (a 19-byte `text/plain` body — a useful fingerprint when diagnosing).

### The traps that actually bit (all cost real time)

1. **The managed DB's hostname is NOT the App Name** — Dokploy appends a random suffix. Using
   the App Name gives `SocketException (11)` from `Dns.GetHostAddresses`, which surfaces as
   "Database is unreachable" in the api and a migrate service that dies before applying
   anything. Take it from the Connection tab → Internal Host. See §3.
2. **Missing required env vars** kill every container at startup, one at a time, in
   `AppEnvironment.Initialize()` order. See §5 for the complete required set.
3. **`FRONT_URL` must have no trailing slash** — CORS is `WithOrigins(FRONT_URL)` and a browser
   origin never has one, so `https://x.com/` never matches and every browser call is blocked.
4. **A domain configured only for the front** leaves the api unreachable from the browser;
   login then fails at the network layer with no server-side log at all.
5. **This deployment observed a secret silently truncated at `#`.**
   The application received only the prefix before that character. The owner seeder then hashed
   the _truncated_ value, the account was created normally, and the only symptom was "Invalid email
   or password" on a password believed to be correct. Nothing logged a warning. This is observed
   project behaviour, not a documented vendor guarantee; avoid the same parsing path for every
   Environment value by using alphanumerics plus `-_.`.

## 9. Troubleshooting

- **App can't reach DB / "Database is unreachable"** → #1 cause: `Host=` uses the App Name you
  typed instead of the real **Internal Host** (Dokploy adds a random suffix). Symptom in the
  migrate log is `SocketException (11)` from `Dns.GetHostAddresses`. Copy the hostname from the
  Postgres service's Connection tab. Also confirm Isolated Deployments is OFF (it can block DB
  reachability even on `dokploy-network`). All services are already on `dokploy-network` in the file.
- **Image pull denied** → GHCR registry auth didn't sync (§2); `docker login` manually.
- **`... : not found` on image pull** → the images for that `RELEASE_TAG` were never published.
  Check that `deploy-images.yml` actually ran **and succeeded** for that commit. Note the
  workflow has a `paths:` filter (`apps/api/**`, `apps/front/**`, `packages/**`, …), so a
  commit touching only e.g. `dokploy.yml` correctly builds nothing — deploy the last commit
  that did build. If GitHub Actions cannot run at all (e.g. the account is over its Actions
  spending limit, which shows as **every** job failing in ~3s with 0 steps and no runner),
  authenticate with `docker login ghcr.io -u <your-github-user>`, then run
  `just deploy-images [ref]` (or `node packages/scripts-ts/src/deploy-images.ts [ref]`). It mirrors
  `deploy-images.yml` exactly and tags all three images with the **same full commit SHA**, from a
  clean detached worktree at that commit.
- **Login fails with a network/"request failed" error (nothing server-side)** → the browser
  cannot reach the API. Either the api has no domain configured (§4.5), or `FRONT_URL` has a
  trailing slash so CORS rejects the origin (see trap 3), or `PUBLIC_API_BASE_URL` is `http://`
  on an HTTPS page (mixed content). Test directly: `curl -i <PUBLIC_API_BASE_URL>/health/live`.
- **Login says "Invalid email or password" with the credentials you're sure are right** → the
  app reached the DB and compared a password, so it's one of exactly two things (the handler
  has distinct messages for suspended/unverified users):
  1. **Your secret may have followed the `#` truncation observed on the first deployment** — see
     trap 5 in §8. Check the stored value, not what you typed into the form.
  2. **The owner was seeded earlier with a different code.** `OwnerBootstrapSeeder` is
     idempotent **by email**: if a user with `STAFF_OWNER_EMAIL` already exists it returns
     immediately and **never updates the password**. So changing
     `STAFF_OWNER_BOOTSTRAP_CODE` after the first successful migration has **no effect** —
     the original hash stands. To recover, change the password in-app, or delete that user
     row and let the next migration reseed it.
- **A 500 with no log line at all** → should no longer happen: production now streams
  Information-and-above to **stdout** (PR #894). Before that fix, errors were written only to
  files inside the container, which the runtime never captures and which die on redeploy. If
  logs ever go quiet again, check the Production branch of `LoggerConfigExtensions.cs` first.
- **Domain never serves** → two causes: (a) domains not added in the Domains tab (§4.5) — no
  domain means no `traefik.*` labels means no routing; or (b) healthcheck never goes healthy —
  check the migrate log (did it finish?) and `/health/ready`; a stuck migrate keeps the app
  unrouted by design.
- **Migrate reruns/loops** → the file already sets `restart: "no"`; if it still loops, confirm
  the compose app is plain "Docker Compose" (not Stack) and the migrate task actually exited 0.

---

### Note on the config

The managed-Postgres topology and runtime-compatible controls (single external
`dokploy-network`, matching no-restart declarations for the migrator, and routing via the Domains
tab instead of labels) are **already in the committed `dokploy.yml`** via PR #892 (Part of #876).
The repository does not select the Dokploy Compose type or declare the external network's driver.
No hand-editing of the compose file is needed — deploy the branch/commit as-is.
