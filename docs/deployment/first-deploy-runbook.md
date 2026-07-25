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
> 1. Dokploy runs a "Docker Compose" app as **plain `docker compose`, NOT Swarm**, by default. So `restart:` applies and `deploy.restart_policy` is ignored; an unhealthy container is **not** restarted or killed — it just stays running and Traefik withholds routing until it's healthy. Our approach-A design works cleanly under this (no crash-loop risk).
> 2. A Dokploy-managed database sits on the shared **`dokploy-network`**. A Compose app gets its **own** network by default and must **explicitly join `dokploy-network`** to reach the DB. This is the #1 thing that breaks a first deploy — **the committed `dokploy.yml` already does this** (all services are on `dokploy-network`, and nothing else).
> 3. Traefik routing is **not** configured by labels in the compose file. You add each domain in Dokploy's **Domains tab**, and Dokploy generates the real `traefik.*` labels (including pinning the container's network to `dokploy-network`). So domain setup is a UI step, not a file edit — see §4.5.

---

## 0. Prerequisites

- Dokploy installed and reachable (admin UI), on the VPS.
- The app images exist in GHCR — CI (`.github/workflows/deploy-images.yml`) builds and pushes
  `ghcr.io/radandevist/publyapp/{api,migrate,front-2}` tagged by commit SHA on push to the
  target branch. Pick the SHA tag you want to deploy (that becomes `RELEASE_TAG`).
  If Actions is billing-stalled, first run `docker login ghcr.io -u radandevist`, then run
  `just deploy-images [ref]` locally (the ref defaults to `origin/develop`), or invoke
  `node scripts/deploy-images.mjs [ref]` directly. The wrapper mirrors the workflow's three builds
  and pushes, using a pristine detached git worktree at the resolved commit rather than the current
  working tree. Copy its final `RELEASE_TAG=<full-SHA>` into Dokploy.
- A GitHub **classic PAT** with `read:packages` (and `write:packages`) scope, for GHCR pulls.
- A domain (or subdomain) pointed at the VPS for the front + api, if you want HTTPS via Traefik.

---

## 1. Config prep — none needed; the committed `dokploy.yml` is deploy-ready

The compose file is already set up for the **Dokploy-managed Postgres + plain-Compose** path
(this is what PR #892 landed). Specifically, you do **not** need to hand-edit it:

- All four services (`publyapp-api`, `publyapp-worker`, `publyapp-migrate`, `publyapp-front`)
  are on **`dokploy-network` only** — so they reach the managed DB and Traefik can route to
  them, with no multi-network ambiguity.
- The one-shot migrate service carries `restart: "no"` (plain-Compose) **and**
  `deploy.restart_policy.condition: none` (Swarm/Stack), so it runs exactly once per deploy
  under either runtime.
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

Dokploy saves these to a host `.env` that your compose file reads via `${VAR}` interpolation.
**The app fails fast at startup on the _first_ missing REQUIRED var** (e.g.
`Environment variable 'DEFAULT_EMAIL_SENDER_EMAIL' is not set`), so every required var below
MUST be present or no container starts. Optional vars are safe to omit — the app falls back to
code defaults when they are blank.

### 5a. REQUIRED — deployment-specific (you provide the value)

| Variable                     | Value                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RELEASE_TAG`                | the GHCR image tag to deploy (the full commit SHA)                                                                                                                                                                                                                                                                                                                   |
| `POSTGRES_CONNECTION_STRING` | `Host=<internal-host>;Port=5432;Database=<db>;Username=<user>;Password=<pass>` — **Host = the Postgres service's Connection tab → "Internal Host"** (it has a Dokploy-generated suffix, e.g. `publyapp-postgres-a1b2c3`; the App Name you typed is NOT the hostname — see step 3). (The app appends `;MaxPoolSize=…` itself.)                                        |
| `STAFF_OWNER_EMAIL`          | the platform owner's login email                                                                                                                                                                                                                                                                                                                                     |
| `STAFF_OWNER_BOOTSTRAP_CODE` | strong secret — becomes the owner's **initial password** on first boot. **Avoid `#` in the value** (and any other env-file metacharacter): Dokploy stores these in a host `.env`, where `#` starts a comment, so `Str0ng#Pass` is silently truncated to `Str0ng`. Nothing errors — you just can't log in. Prefer long alphanumeric + `-_.` only. See the trap in §8. |
| `RESEND_API_KEY`             | your Resend API key (rotate the committed placeholder)                                                                                                                                                                                                                                                                                                               |
| `APP_NAME`                   | display/app name (e.g. `PublyApp`)                                                                                                                                                                                                                                                                                                                                   |
| `FRONT_URL`                  | public URL of the front (e.g. `https://publyapp.com`)                                                                                                                                                                                                                                                                                                                |
| `DEFAULT_EMAIL_SENDER_EMAIL` | the "from" address — must be a **Resend-verified** domain for mail to deliver (app still starts if not)                                                                                                                                                                                                                                                              |
| `TRUSTED_PROXY_CIDRS`        | Traefik's exact address(es), expressed as `/32` (IPv4) or `/128` (IPv6), or the CIDR of a dedicated proxy network joined **only** by Traefik and the API. Do not trust the shared `dokploy-network` subnet: any peer container could then forge `X-Forwarded-For`. Universal CIDRs (`0.0.0.0/0`, `::/0`) are rejected at startup. Recheck exact addresses after Traefik/network recreation. |
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
> `.env.example` template lists every variable with a working placeholder value. It is the only
> committed env file — `.env.development` and `.env.production` are gitignored local/deployment
> state and must never be committed.

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

- ✅ **Runtime is plain `docker compose`, NOT Swarm.** The deploy log states it outright:
  `Compose Type: docker-compose`. So `restart:` governs and `deploy.restart_policy` is inert;
  an unhealthy container is not killed, it just stays unrouted. (Both forms are set on the
  migrate service, so switching to Stack later still behaves.)
- ✅ **The overlay network is `dokploy-network`**, joined as `external: true`. All four services
  are on it and nothing else — the managed Postgres is reachable there.
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
5. **A `#` inside a secret truncates it silently.** Dokploy writes the Environment tab to a
   host `.env`, and `#` begins a comment there — so `STAFF_OWNER_BOOTSTRAP_CODE=Str0ng#Pass`
   is stored as `Str0ng`. The seeder then hashes the _truncated_ value, the account is created
   normally, and the only symptom is "Invalid email or password" on a password you believe is
   correct. Nothing logs a warning. Applies to every secret, not just this one — keep env
   values to alphanumerics plus `-_.` and it can't happen.

## 9. Troubleshooting

- **App can't reach DB / "Database is unreachable"** → #1 cause: `Host=` uses the App Name you
  typed instead of the real **Internal Host** (Dokploy adds a random suffix). Symptom in the
  migrate log is `SocketException (11)` from `Dns.GetHostAddresses`. Copy the hostname from the
  Postgres service's Connection tab. Also confirm Isolated Deployments is OFF (it can block DB
  reachability even on `dokploy-network`). All services are already on `dokploy-network` in the file.
- **Image pull denied** → GHCR registry auth didn't sync (§2); `docker login` manually.
- **`... : not found` on image pull** → the images for that `RELEASE_TAG` were never published.
  Check that `deploy-images.yml` actually ran **and succeeded** for that commit. Note the
  workflow has a `paths:` filter (`apps/api/**`, `apps/front-2/**`, `packages/**`, …), so a
  commit touching only e.g. `dokploy.yml` correctly builds nothing — deploy the last commit
  that did build. If GitHub Actions cannot run at all (e.g. the account is over its Actions
  spending limit, which shows as **every** job failing in ~3s with 0 steps and no runner),
  authenticate with `docker login ghcr.io -u radandevist`, then run
  `just deploy-images [ref]` (or `node scripts/deploy-images.mjs [ref]`). It mirrors
  `deploy-images.yml` exactly and tags all three images with the **same full commit SHA**, from a
  clean detached worktree at that commit.
- **Login fails with a network/"request failed" error (nothing server-side)** → the browser
  cannot reach the API. Either the api has no domain configured (§4.5), or `FRONT_URL` has a
  trailing slash so CORS rejects the origin (see trap 3), or `PUBLIC_API_BASE_URL` is `http://`
  on an HTTPS page (mixed content). Test directly: `curl -i <PUBLIC_API_BASE_URL>/health/live`.
- **Login says "Invalid email or password" with the credentials you're sure are right** → the
  app reached the DB and compared a password, so it's one of exactly two things (the handler
  has distinct messages for suspended/unverified users):
  1. **Your secret got truncated at a `#`** — see trap 5 in §8. This is the likely one. Check
     the stored value, not what you typed into the form.
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

The managed-Postgres + plain-Compose correctness fixes (single `dokploy-network`, migrate
`restart: "no"`, routing via the Domains tab instead of labels) are **already in the committed
`dokploy.yml`** via PR #892 (Part of #876). No hand-editing of the compose file is needed —
deploy the branch/commit as-is.
