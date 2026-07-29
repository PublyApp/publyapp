# Front-2 Hosted Staging Deploy Design

> **DEFERRED — hosted staging stands up after local Phase 1 is green; Dokploy
> mechanism + secrets are TBD then.**

This document records the future hosted-staging shape for M1.5. Phase 1 remains
local-first: do not add hosted-staging DEPLOY workflow files, do not stand up Dokploy services, and
do not wire production-adjacent secrets until the local compose harness is green.

## Locked Targets

| Item | Value |
|---|---|
| Front-2 domain | `https://front-2.staging.publyapp.com` |
| Front-2 API domain | `https://api.front-2.staging.publyapp.com` |
| Front-2 service | `publyapp-front-2-staging` |
| API service | `publyapp-api-staging` |
| Database service | `publyapp-postgres-staging` |
| Front-2 image | `ghcr.io/radandevist/publyapp/front:<sha>` |
| Moving staging tag | `ghcr.io/radandevist/publyapp/front:staging` |
| API artifact | same API revision for runtime and migrate job |

The staging API and staging Postgres are dedicated to front-2 staging. They must
not share the production API service, production database, local development
database, or any future non-front-2 staging database.

The `:staging` front-2 tag is a convenience pointer updated by the future
release/publish mechanism after `:<sha>` is published. Dokploy should deploy the
immutable `:<sha>` tag, not the moving tag.

## Dokploy Delta

Add staging services alongside the current `publyapp-api` and `publyapp-front`
services in `dokploy.yml`. Keep the existing production services unchanged.
This delta keeps `publyapp-network` only for proxy-facing services and adds a
staging-only internal network for front-2-to-API and API-to-database traffic.
`publyapp-front-2-staging` and `publyapp-api-staging` join both networks:
only front-2 SSR/server-side API calls use the internal network by container
DNS, while browser API calls use the public API domain through Traefik. The
shared proxy network is only for Traefik-facing ingress.
`publyapp-postgres-staging` must stay on the internal network only and must not
join the shared proxy network.
The current `dokploy.yml` defines `publyapp-network` as a bridge network; keep
that existing network shape unless the real Dokploy project later changes it.

The primary deferred staging mode is build-based: the deploy checks out one
exact deploy SHA, then both `publyapp-api-staging-migrate` and
`publyapp-api-staging` use `build:` from that same checkout. Do not build one
from the working tree while running the other from
`ghcr.io/radandevist/publyapp/api:latest`. Alternative: pin API runtime and
migrate services to immutable images built from the same SHA.

```yaml
services:
  publyapp-postgres-staging:
    image: postgres:18-alpine
    container_name: publyapp-postgres-staging
    restart: unless-stopped
    environment:
      - POSTGRES_USER=<staging-postgres-user>
      - POSTGRES_PASSWORD=<staging-postgres-password>
      - POSTGRES_DB=<staging-postgres-db>
    networks:
      - publyapp-front-2-staging-internal
    volumes:
      - publyapp-postgres-staging-data:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER"]
      interval: 30s
      timeout: 10s
      retries: 3

  publyapp-api-staging-migrate:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
      target: migrate
    container_name: publyapp-api-staging-migrate
    restart: "no"
    environment:
      - ASPNETCORE_ENVIRONMENT=Production
      - DOTNET_ENVIRONMENT=Production
      - ASPNETCORE_URLS=http://+:5000
      # Migration/model creation is an API-role tooling path, never an implicit `all` or
      # worker host (design §3.1 item 5, R4-4). Under a production-like environment a
      # missing APP_ROLE is a fail-fast startup error, so this pin is required, not
      # cosmetic. The Dockerfile's `migrate` stage pins it too, as a backstop.
      - APP_ROLE=api
      - POSTGRES_CONNECTION_STRING=Host=publyapp-postgres-staging;Port=5432;Database=<staging-postgres-db>;Username=<staging-postgres-user>;Password=<staging-postgres-password>;
      - FRONT_URL=https://front-2.staging.publyapp.com
      - RESEND_API_KEY=<set-in-dokploy>
      - STAFF_OWNER_EMAIL=<set-in-dokploy>
      - STAFF_OWNER_BOOTSTRAP_CODE=<set-in-dokploy>
      - APP_NAME=PublyApp
      - DEFAULT_EMAIL_SENDER_EMAIL=<set-in-dokploy>
      - DEFAULT_EMAIL_SENDER_NAME=<set-in-dokploy>
      - SESSION_TOKEN_HEADER_KEY=X-Session-Token
      - TENANT_ID_HEADER_KEY=X-PublyApp-TenantId
      - SESSION_EXPIRY_DAYS=7
      - EMAIL_VERIFY_TOKEN_VALIDITY_DURATION=7
      - PASSWORD_RESET_TOKEN_VALIDITY_DURATION=7
      - PASSWORD_MIN_LENGTH=12
      - EMAIL_VERIFY_TOKEN_LENGTH=25
      - PASSWORD_RESET_TOKEN_LENGTH=25
      - INVITATION_TOKEN_LENGTH=32
      - MAX_PROFILES_PER_USER=5
      - DI_MANIFEST_ENABLED=false
      - AUDIT_LOG_EXPORT_MAX_ROWS=10000
    networks:
      - publyapp-front-2-staging-internal
    depends_on:
      publyapp-postgres-staging:
        condition: service_healthy

  publyapp-api-staging:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
      target: runtime
    container_name: publyapp-api-staging
    restart: unless-stopped
    environment:
      - ASPNETCORE_ENVIRONMENT=Production
      - DOTNET_ENVIRONMENT=Production
      - ASPNETCORE_URLS=http://+:5000
      # This container serves ONLY the HTTP surface; it must register no job
      # hosted-services (design §3.2, D1). A missing APP_ROLE is a fail-fast startup
      # error under a production-like environment (§3.1, C6/F24) — `all` is never
      # inherited by omission.
      - APP_ROLE=api
      - POSTGRES_CONNECTION_STRING=Host=publyapp-postgres-staging;Port=5432;Database=<staging-postgres-db>;Username=<staging-postgres-user>;Password=<staging-postgres-password>;
      - FRONT_URL=https://front-2.staging.publyapp.com
      - RESEND_API_KEY=<set-in-dokploy>
      - STAFF_OWNER_EMAIL=<set-in-dokploy>
      - STAFF_OWNER_BOOTSTRAP_CODE=<set-in-dokploy>
      - APP_NAME=PublyApp
      - DEFAULT_EMAIL_SENDER_EMAIL=<set-in-dokploy>
      - DEFAULT_EMAIL_SENDER_NAME=<set-in-dokploy>
      - SESSION_TOKEN_HEADER_KEY=X-Session-Token
      - TENANT_ID_HEADER_KEY=X-PublyApp-TenantId
      - SESSION_EXPIRY_DAYS=7
      - EMAIL_VERIFY_TOKEN_VALIDITY_DURATION=7
      - PASSWORD_RESET_TOKEN_VALIDITY_DURATION=7
      - PASSWORD_MIN_LENGTH=12
      - EMAIL_VERIFY_TOKEN_LENGTH=25
      - PASSWORD_RESET_TOKEN_LENGTH=25
      - INVITATION_TOKEN_LENGTH=32
      - MAX_PROFILES_PER_USER=5
      - DI_MANIFEST_ENABLED=false
      - AUDIT_LOG_EXPORT_MAX_ROWS=10000
    networks:
      - publyapp-network
      - publyapp-front-2-staging-internal
    labels:
      - "dokploy.domain=api.front-2.staging.publyapp.com"
      - "dokploy.port=5000"
      - "dokploy.https=true"
    depends_on:
      publyapp-postgres-staging:
        condition: service_healthy
      publyapp-api-staging-migrate:
        condition: service_completed_successfully
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  publyapp-front-2-staging:
    image: ghcr.io/radandevist/publyapp/front:<sha>
    container_name: publyapp-front-2-staging
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3000
      - PUBLIC_API_BASE_URL=https://api.front-2.staging.publyapp.com
      - SERVER_API_BASE_URL=http://publyapp-api-staging:5000
    networks:
      - publyapp-network
      - publyapp-front-2-staging-internal
    labels:
      - "dokploy.domain=front-2.staging.publyapp.com"
      - "dokploy.port=3000"
      - "dokploy.https=true"
    depends_on:
      publyapp-api-staging:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  publyapp-postgres-staging-data:

networks:
  publyapp-network:
    driver: bridge
  publyapp-front-2-staging-internal:
    driver: bridge
    internal: true
```

Notes:

- The front-2 image follows the spike container shape: Node runtime, `PORT=3000`,
  `PUBLIC_API_BASE_URL=https://api.front-2.staging.publyapp.com` for browser
  calls/CSP/runtime injection, and `SERVER_API_BASE_URL` only for SSR/server
  functions.
- M0/M1.0 smoke checks target `/` for the current scaffold surface. At M1.4/M1.5,
  after login route exists, migrate smoke to `/login`.
- `SERVER_API_BASE_URL=http://publyapp-api-staging:5000` resolves over
  `publyapp-front-2-staging-internal`; only server-side front-2 calls use that
  container DNS path. Browser calls use
  `PUBLIC_API_BASE_URL=https://api.front-2.staging.publyapp.com`.
- The staging API keeps single-origin CORS by setting `FRONT_URL` to the
  front-2 staging origin.
- Use Dokploy secret interpolation with explicit quoting for
  `POSTGRES_CONNECTION_STRING` so passwords containing `;` or other special
  characters are not mis-escaped.
- `/health` is a real API route registered by `app.MapHealthChecks("/health")`.
  The runtime API image installs `wget` in `apps/api/Dockerfile`, matching the
  spike compose healthcheck.
- The migration service mirrors the spike compose dependency shape, but
  `condition: service_completed_successfully` is not enough by itself for
  redeploys: an old exited-zero container can satisfy the dependency. The
  deployment procedure must build or pull both API targets from the exact deploy
  SHA, rerun `publyapp-api-staging-migrate` from that artifact, then start or
  redeploy `publyapp-api-staging` only after that exact run exits successfully.
- If Dokploy cannot build the `apps/api/Dockerfile` `migrate` and `runtime`
  targets from the same revision, publish an immutable staging API image and use
  the matching migration artifact from the same commit. Do not use
  `ghcr.io/radandevist/publyapp/api:latest` for staging rollback-sensitive API
  changes.

## Migrate And Seed Job

Run migrations and seeders against the isolated staging database before
`publyapp-api-staging` accepts traffic. Do not run a normal host-shell migration
with `Host=publyapp-postgres-staging`; that name is Docker service DNS and only
resolves from containers attached to `publyapp-front-2-staging-internal`.

The preferred path is the container-attached migration service in the Dokploy
delta. It must receive the full API env-var block from `publyapp-api-staging`,
including `FRONT_URL`, email settings, owner bootstrap settings, session/header
settings, token/password settings, profile limits, and optional deploy-explicit
settings.

For build-based Dokploy deploys, run this only after Dokploy has checked out the
deploy SHA. Build both API targets from that checkout before migration so the
one-shot migration and long-running API runtime cannot drift:

```bash
docker compose -f dokploy.yml build --pull \
  publyapp-api-staging-migrate \
  publyapp-api-staging

docker compose -f dokploy.yml up -d --wait publyapp-postgres-staging

docker compose -f dokploy.yml rm -f publyapp-api-staging-migrate

docker compose -f dokploy.yml up --force-recreate --no-deps \
  --exit-code-from publyapp-api-staging-migrate \
  publyapp-api-staging-migrate

docker compose -f dokploy.yml up -d --wait publyapp-api-staging

docker compose -f dokploy.yml up -d publyapp-front-2-staging
```

This is an offline API deploy step: do not recreate
`publyapp-postgres-staging` during migration, and do not route traffic to
`publyapp-api-staging` until Postgres is healthy and the migration command exits
zero. Start front-2 only after `publyapp-api-staging` is healthy. The migration
command keeps `--no-deps` only because this sequence has already waited for
Postgres explicitly and should not let a one-shot redeploy recreate other
services. The `rm -f publyapp-api-staging-migrate` step guarantees the one-shot
container is fresh for the current deploy SHA instead of reusing an exited
container from a prior deploy. Avoid
`docker compose up --force-recreate --abort-on-container-exit
publyapp-api-staging-migrate` during a redeploy because it can recreate
dependencies and interrupt the existing staging API.

If Dokploy uses immutable API artifacts instead of local builds, replace the
build step with pulls for the matched runtime and migrate images for the deploy
SHA, then run the same migrate-before-runtime sequence.

The API Dockerfile has a `migrate` target whose entrypoint runs
`dotnet ef database update --verbose`. In this repo, `AppDbContext` registers EF
`UseSeeding` and `UseAsyncSeeding`; the migration job is therefore the migration
plus seed gate. It must complete before the API service is started or
redeployed.

In Dokploy/container form, use `publyapp-api-staging-migrate`, the API Dockerfile
`migrate` target, or an equivalent one-shot job with:

- `ASPNETCORE_ENVIRONMENT=Production`
- `DOTNET_ENVIRONMENT=Production`
- `APP_ROLE=api` — required (design §3.1 item 5, R4-4): the migration job builds the
  app's host, and under a production-like environment a missing `APP_ROLE` fails startup
  by design rather than silently composing the job engine into a migration process
- `POSTGRES_CONNECTION_STRING=Host=publyapp-postgres-staging;Port=5432;Database=<staging-postgres-db>;Username=<staging-postgres-user>;Password=<staging-postgres-password>;`
- the same required API env-var names used by `publyapp-api-staging`

If a host-shell migration is ever needed, use a host-reachable staging database
endpoint instead of Docker service DNS, keep it pointed at the isolated staging
Postgres only, and source the same complete API env-var set that Dokploy uses.
The job must point at the dedicated staging Postgres only. It must not run
against production, local development, or a shared database.

## Environment Variable Names

Values are set in Dokploy. This list intentionally records names only. API env
names were verified against `apps/api/Lib/AppEnvironment.cs` and the
committed `.env.example` template (the only committed env file — real
`.env.development`/`.env.production` are gitignored); front-2 env names were
verified when this list was written (#704) against the then-current
`apps/front-2-spike/docker-compose.test.yml`,
`apps/front-2-spike/src/env.d.ts`, and the spike's server/client references. The
spike was removed in #965; the same names are carried today by
`apps/front/docker-compose.test.yml`, `apps/front/src/env.d.ts`, and the
front-2 server/client references. `ASPNETCORE_ENVIRONMENT`,
`DOTNET_ENVIRONMENT`, `ASPNETCORE_URLS`, `NODE_ENV`, and `PORT` are host/runtime
variables, not `AppEnvironment` properties.

API:

- `ASPNETCORE_ENVIRONMENT`
- `DOTNET_ENVIRONMENT`
- `ASPNETCORE_URLS`
- `POSTGRES_CONNECTION_STRING`
- `FRONT_URL`
- `RESEND_API_KEY`
- `STAFF_OWNER_EMAIL`
- `STAFF_OWNER_BOOTSTRAP_CODE`
- `APP_NAME`
- `DEFAULT_EMAIL_SENDER_EMAIL`
- `DEFAULT_EMAIL_SENDER_NAME`
- `SESSION_TOKEN_HEADER_KEY`
- `TENANT_ID_HEADER_KEY`
- `SESSION_EXPIRY_DAYS`
- `EMAIL_VERIFY_TOKEN_VALIDITY_DURATION`
- `PASSWORD_RESET_TOKEN_VALIDITY_DURATION`
- `PASSWORD_MIN_LENGTH`
- `EMAIL_VERIFY_TOKEN_LENGTH`
- `PASSWORD_RESET_TOKEN_LENGTH`
- `INVITATION_TOKEN_LENGTH`
- `MAX_PROFILES_PER_USER`
- `DI_MANIFEST_ENABLED`
- `AUDIT_LOG_EXPORT_MAX_ROWS`

`DI_MANIFEST_ENABLED` and `AUDIT_LOG_EXPORT_MAX_ROWS` are optional in
`AppEnvironment` with defaults of `false` and `10000`. They are still shown in
the deploy delta so staging has explicit, reviewable behavior.

Front-2:

- `NODE_ENV`
- `PORT`
- `PUBLIC_API_BASE_URL`
- `SERVER_API_BASE_URL`

Session/cookie names and keys:

- `SESSION_TOKEN_HEADER_KEY` is the API header name, currently
  `X-Session-Token`.
- `TENANT_ID_HEADER_KEY` is the tenant header name, currently
  `X-PublyApp-TenantId`.
- `SESSION_TOKEN_COOKIE_KEY` is a shared TypeScript constant, currently
  `publyapp-session_token`; it is not an env var today.
- No separate session cookie signing-secret env var exists in the current
  front/API code. If M1.5 introduces signed or encrypted cookies, choose and
  document the real env-var name during that implementation, and set it only in
  Dokploy (`<set-in-dokploy>`).

## CSP And Cookies

Front-2 must include the staging API origin in `connect-src`:

```text
connect-src 'self' https://api.front-2.staging.publyapp.com
```

The spike implementation appends the origin derived from `PUBLIC_API_BASE_URL`,
so staging should set:

```text
PUBLIC_API_BASE_URL=https://api.front-2.staging.publyapp.com
```

Cookie domain strategy:

- Keep the session cookie host-only on `front-2.staging.publyapp.com` by
  omitting an explicit `Domain` attribute. Set `Path=/`, `Secure`, and
  `SameSite=Lax`. This matches the current front-2 server-action cookie
  behavior and avoids leaking staging cookies to broader `publyapp.com` hosts.
- The current front-2 spike uses a JS-readable session cookie (`httpOnly: false`)
  to match the shipped app's browser Kiota client. Browser requests read the
  host-only cookie from `document.cookie` and send the token in
  `SESSION_TOKEN_HEADER_KEY` to `api.front-2.staging.publyapp.com`; server/SSR
  requests parse the incoming front-domain `Cookie` header and forward the same
  header to the internal API base (`SERVER_API_BASE_URL`). Browser requests do
  not use the internal container DNS URL.
- The API must not depend on receiving browser cookies from
  `api.front-2.staging.publyapp.com`. The auth boundary is the explicit
  `SESSION_TOKEN_HEADER_KEY` header.
- If a future M1.5 implementation requires direct browser cookie sharing across
  the two locked staging domains, use `Domain=.front-2.staging.publyapp.com`
  only. Do not use `Domain=.staging.publyapp.com` or `Domain=.publyapp.com` for
  front-2 staging.

## Smoke

After deploying the staging services and running the migrate/seed job, smoke the
login route and API health endpoint:

```bash
curl --fail --show-error --silent --location \
  https://front-2.staging.publyapp.com/login \
  --output /dev/null

curl --fail --show-error --silent \
  https://api.front-2.staging.publyapp.com/health \
  --output /dev/null
```

Confirm the front-2 `/login` page carries the staging API origin in CSP:

```bash
front2_login_headers="$(mktemp)"
front2_login_html="$(mktemp)"

curl --fail --show-error --silent --dump-header "$front2_login_headers" \
  --output "$front2_login_html" \
  https://front-2.staging.publyapp.com/login \
  && tr -d '\r' < "$front2_login_headers" \
    | grep -i '^content-security-policy:' \
    | grep -i 'connect-src' \
    | grep -F "https://api.front-2.staging.publyapp.com"
```

If runtime HTML injection is expected for the deployed front-2 image, check it
separately from the CSP header:

```bash
grep -F "https://api.front-2.staging.publyapp.com" "$front2_login_html"
```

Confirm browser CORS preflight accepts the session and tenant headers:

```bash
front2_cors_headers="$(mktemp)"

curl --fail --show-error --silent --dump-header "$front2_cors_headers" \
  --output /dev/null --request OPTIONS \
  https://api.front-2.staging.publyapp.com/auth/user-auth-data \
  --header 'Origin: https://front-2.staging.publyapp.com' \
  --header 'Access-Control-Request-Method: GET' \
  --header 'Access-Control-Request-Headers: X-Session-Token, X-PublyApp-TenantId' \
  && tr -d '\r' < "$front2_cors_headers" \
    | grep -iF 'access-control-allow-origin: https://front-2.staging.publyapp.com' \
  && tr -d '\r' < "$front2_cors_headers" \
    | grep -iF 'access-control-allow-methods:' \
    | grep -iF 'GET' \
  && tr -d '\r' < "$front2_cors_headers" \
    | grep -iF 'access-control-allow-headers:' \
    | grep -iF 'X-Session-Token' \
    | grep -iF 'X-PublyApp-TenantId'
```

When the Playwright smoke suite graduates from the local harness, run that suite
against:

```text
https://front-2.staging.publyapp.com/login
```

The smoke must not touch production services. Browser/API traffic must go to
`https://api.front-2.staging.publyapp.com`, not `https://api.publyapp.com`.

## Rollback

Front-2-only rollback is image-based:

1. Identify the last known-good immutable front-2 image tag:
   `ghcr.io/radandevist/publyapp/front:<previous-sha>`.
2. Point `publyapp-front-2-staging` back to the selected known-good front-2 image
   tag in Dokploy.
3. Redeploy `publyapp-front-2-staging`.
4. Re-run the login and API smoke checks against
   `https://front-2.staging.publyapp.com/login`.

The moving `:staging` tag is only a convenience pointer. The rollback decision
should use immutable `:<sha>` tags so the exact deployed artifact is known.

API rollback is deploy-revision based until an immutable staging API image scheme
is added:

1. Identify the last known-good API deploy revision used by both
   `publyapp-api-staging` and `publyapp-api-staging-migrate`.
2. If the failed deploy ran any non-additive migration, restore the isolated
   `publyapp-postgres-staging` backup taken immediately before that deploy. Do
   not start the previous API against a newer incompatible schema.
3. Point Dokploy at the last known-good API revision and build both API targets
   from that same checkout:

   ```bash
   docker compose -f dokploy.yml build --pull \
     publyapp-api-staging-migrate \
     publyapp-api-staging
   ```

4. If the database was restored, or if the previous API revision requires
   forward-compatible migrations for the current staging database, run
   `publyapp-api-staging-migrate` from the rebuilt rollback artifact:

   ```bash
   docker compose -f dokploy.yml up -d --wait publyapp-postgres-staging

   docker compose -f dokploy.yml rm -f publyapp-api-staging-migrate

   docker compose -f dokploy.yml up --force-recreate --no-deps \
     --exit-code-from publyapp-api-staging-migrate \
     publyapp-api-staging-migrate
   ```

5. Start the rollback API and smoke it before bringing front-2 back onto it:

   ```bash
   docker compose -f dokploy.yml up -d --wait publyapp-api-staging

   curl --fail --show-error --silent \
     https://api.front-2.staging.publyapp.com/health \
     --output /dev/null
   ```

6. Redeploy `publyapp-front-2-staging` to the front-2 image that matches the
   rollback API contract, then run the login and CORS smoke checks.

If Dokploy later publishes immutable API runtime and migrate artifacts, use the
same rollback sequence with pinned previous API artifacts instead of rebuilding
from a previous checkout. Runtime and migrate artifacts must still come from the
same API revision.

Database rollback policy:

- Prefer forward-compatible migrations for front-2 staging.
- Before any non-additive staging migration, take a Dokploy/Postgres volume
  backup or database dump for the isolated staging Postgres service.
- If rollback requires schema/data rollback, restore that isolated staging
  backup. Never point staging at production as a rollback shortcut.
