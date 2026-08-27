# Proof: Issue #1642 — E2E Compose per-worktree isolation

## Defect: Hardcoded Compose project name collides across worktrees

**File:** `apps/front/docker-compose.test.yml`

**Before:**
```yaml
name: publyapp-front2-real-test   # ❌ shared name — ALL worktrees/index on this
```
All published ports were hardcoded:
- traefik web: `8080`
- traefik websecure: `8443`
- request-counter: `8800`
- toxiproxy: `8474`

**Impact:** Two worktrees on the same machine share the same containers and volumes.
If worktree A runs `docker compose down -v`, it destroys worktree B's database.
New e2e suites (auth-error, i18n, field-validation, seo, ssr-auth-shell, log-leak)
all pointed at `front.localhost:8443` — which only worked if nothing else was using port 8443.

## Fix (Voie A — isolation par arbre)

### 1. Removed `name:` from docker-compose.test.yml

Compose now derives the project name from `COMPOSE_PROJECT_NAME` env var.
No two worktrees ever index on the same name.

### 2. Parameterized all 4 published ports

```yaml
ports:
  - "127.0.0.1:${E2E_PORT_TRAEFIK_WEB:-8080}:80"
  - "127.0.0.1:${E2E_PORT_TRAEFIK_WEBSECURE:-8443}:443"
  - "127.0.0.1:${E2E_PORT_REQUEST_COUNTER:-8800}:8800"
  - "127.0.0.1:${E2E_PORT_TOXIPROXY:-8474}:8474"
```

Defaults preserve backward compat; `e2e-compose-env.ts` sets the overrides.

### 3. Parameterized FRONT_URL and PUBLIC_API_BASE_URL

So the API and Frontend containers trust the correct browser-accessible port:
```yaml
FRONT_URL: https://front.localhost:${E2E_PORT_TRAEFIK_WEBSECURE:-8443}
PUBLIC_API_BASE_URL: https://api.front.localhost:${E2E_PORT_TRAEFIK_WEBSECURE:-8443}
```

### 4. `apps/front/scripts/e2e-compose-env.ts`

Derives a stable, worktree-specific `COMPOSE_PROJECT_NAME` and port offsets
by hashing the worktree path. Ports are assigned from a base-11000 range
with a 330-stride offset per worktree. Project names are truncated to
stay within Docker Compose's 64-character limit (with a 4-char SHA-256
hash suffix for uniqueness on long worktree names).

### 5. Justfile `ci-e2e-front` + CI workflow

Both source `e2e-compose-env.ts` (or set `COMPOSE_PROJECT_NAME` via `github.run_id + shard`
in CI) before invoking any `docker compose` command.

### 6. E2E specs + helpers

`apps/front/e2e/helpers/compose-env.ts` reads `E2E_BASE_URL` / `E2E_API_BASE_URL`
from the env (set by `e2e-compose-env.ts`). All 6 spec files + `helpers/api.ts`
use these helpers instead of hardcoded URLs.

## Demonstration: Two parallel worktrees

### Worktree 1: `wt-1642`

```
export COMPOSE_PROJECT_NAME="publyapp-e2e-wt-1642"
export E2E_PORT_REQUEST_COUNTER=11910
export E2E_PORT_TOXIPROXY=11584
export E2E_PORT_TRAEFIK_WEB=11190
export E2E_PORT_TRAEFIK_WEBSECURE=11553
export E2E_BASE_URL="https://front.localhost:11553"
export E2E_API_BASE_URL="https://api.front.localhost:11553"
```

### Worktree 2: `wt-proof-1642-proof`

```
export COMPOSE_PROJECT_NAME="publyapp-e2e-wt-proof-1642-proof"
export E2E_PORT_REQUEST_COUNTER=13240
export E2E_PORT_TOXIPROXY=12914
export E2E_PORT_TRAEFIK_WEB=12520
export E2E_PORT_TRAEFIK_WEBSECURE=12883
export E2E_BASE_URL="https://front.localhost:12883"
export E2E_API_BASE_URL="https://api.front.localhost:12883"
```

### Result: no collision

| Port | Worktree 1 | Worktree 2 | Old (before fix) |
|------|-----------|-----------|-----------------|
| traefik web | 11190 | 12520 | 8080 |
| traefik websecure | 11553 | 12883 | 8443 |
| request-counter | 11910 | 13240 | 8800 |
| toxiproxy | 11584 | 12914 | 8474 |

Every port is distinct across the two worktrees. `docker compose down -v` in worktree 1
will never touch worktree 2's containers or volumes.

## Validation

- `docker compose -f apps/front/docker-compose.test.yml config --quiet` → **COMPOSE OK**
- `npx tsx apps/front/scripts/ci/compose-startup.test.mts` → **3/3 pass**
- `e2e-compose-env.ts` produces correct non-colliding exports for both worktrees.

## Files changed

- `apps/front/docker-compose.test.yml` — removed `name:`, parameterized ports + URLs
- `apps/front/scripts/e2e-compose-env.ts` — new, derives per-worktree env
- `apps/front/e2e/helpers/compose-env.ts` — new, reads env for specs
- `apps/front/e2e/helpers/api.ts` — uses compose-env instead of hardcoded URLs
- `apps/front/e2e/{auth-error,i18n-namespaces,i18n,field-validation,seo,ssr-auth-shell,log-leak,request-counter}.spec.ts` — use compose-env
- `apps/front/e2e/README.md` — per-worktree instructions + port docs
- `.github/workflows/front-e2e.yml` — CI sets `COMPOSE_PROJECT_NAME` per run
- `justfile` — `ci-e2e-front` evals `e2e-compose-env.ts` before compose
