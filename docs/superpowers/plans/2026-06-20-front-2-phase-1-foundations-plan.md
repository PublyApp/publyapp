# Front-2 Phase 1 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a durable `apps/front-2` (TanStack Start + HeroUI v3) carrying the proven foundation layer — app shell, auth/session, error views, i18n SSR, CSP/nonce, theme, table system, `Field.*` — deployed continuously to staging, with the framework-agnostic core folded into `shared-ts` via injected seams.

**Architecture:** Fresh app, deliberate harvest from `apps/front-2-spike` (cleaned). Authed = CSR (`ssr:false`); marketing/auth = SSR. Direct-Kiota (no BFF); `createServerFn` = frontend-server concerns only (see "Server-function boundary" below). Shared fold is **ports-and-adapters**: pure contracts in `shared-ts`, app-bound pieces (ClientManager, HeroUI renderers, env/cookies) stay app-local behind injected seams. Milestones: M0 bootstrap+baseline+staging-design, M1 staging-capable shell, M2 data & form systems.

**Tech Stack:** TanStack Start 1.168.x (re-pin at M0), HeroUI v3.2.1, Tailwind v4, React 19, TanStack Query/Table, react-query-kit, RHF + Zod + InterZod + `@hookform/resolvers`, i18next, Kiota client (`@org/client-ts`), `@org/shared-ts`, Vitest, Playwright + `@axe-core/playwright`, srvx, Dokploy/Traefik staging.

**Source-of-truth spec:** `docs/superpowers/specs/2026-06-20-front-2-phase-1-foundations-design.md` (Rev 3).

**Rev 3 changelog (plan round-2):** all 8 round-1 blocking closed; fixed the 3 remaining items — M0.7 now copies the FULL e2e support stack (`toxiproxy` + `traefik-dynamic.test.yml`) that `log-leak.spec` depends on; M2.0 URL params include `size`; M1.5a commits the Dockerfile before pushing the `:<sha>` image.

**Rev 2 changelog (plan-review reconciliation, GPT-5.5 xhigh):** M0.1 now scaffolds a *minimal buildable shell* (the spike router graph pulls transitive imports not yet copied) with a correct lockfile flow (non-frozen update → commit lock → frozen verify); added M0.7 (front-2 e2e harness) since the spike compose/playwright hard-code spike paths; M1.1 adds shared-ts test infra + a **scope-aware** client seam (`getOrCreateClient`/`getOrCreateStaffClient`/`getOrCreateAnonymousClient`, matching the real `ClientManager`) and writes `api-failure` tests from **current-app** precedence (body/problem-first), NOT the spike's transport-first (the Phase-0 watch-item); M2.0 uses **snake_case** URL params (`sort_id`/`sort_order`, per AGENTS.md); staging (M0.4) marks the domain + Dokploy token as an explicit **INFRA INPUT (Radan)**; M1.5 split into 3 PRs; added a staff-users **parity decision** pre-task; tightened every vague acceptance gate; added `@axe-core/playwright`; added front-2 to root format scripts.

---

## Conventions for every task

- Branch `feat/front-2-phase-1-<task-id>` off `develop`; one PR per task, each with a linked sub-issue under the Phase 1 epic. **Never** push to `develop`.
- After any dependency change: non-frozen `pnpm install` to update the lockfile, **commit `pnpm-lock.yaml`**, then `node apps/front-2/scripts/assert-pinned.mjs` → `All deps exact-pinned ✔`, then verify with `pnpm install --frozen-lockfile --ignore-scripts`.
- Type-check: `pnpm --filter front-2 typecheck`. Lint: `pnpm lint`. Format: `pnpm format` (front-2 must be in scope — added in M0.1).
- "Harvest from spike" = copy the named file, then apply the listed cleanups. The spike stays untouched.
- `client-ts` is Kiota-generated — never hand-edit.

**Server-function boundary (precise — MAJOR-2 fix):** `createServerFn` in front-2 is for *frontend-server concerns*: cookie read/write, the login call that **sets the session cookie**, and i18n resource loading. It is **NOT** a BFF: no fetching/aggregating domain entities server-side, no proxying app-data queries (those go browser→Kiota directly). A server fn returning a raw `Cookie`/token is a leak (read cookies via a server-only helper).

## File Structure

```
apps/front-2/
  package.json · tsconfig.json · vite.config.ts · vitest.config.ts · playwright.config.ts
  docker-compose.test.yml · Dockerfile · server.mjs · .npmrc · scripts/assert-pinned.mjs · README.md
  src/ router.tsx · server.ts · routes.ts · env.d.ts
      routes/ __root.tsx · index.tsx · login.tsx · authed/* · marketing/*
      components/ app-shell/ · error-views/ · field/ · table/ · query-display.tsx
      layouts/ marketing-layout.tsx · auth-layout.tsx · authed-layout.tsx
      lib/ api-client/client-manager.ts (adapter) · i18n.* · url-state/ · analytics.ts · store/ · server/
      styles/app.css · utils/seo.ts
  e2e/ (smoke, csp, log-leak, auth-error, i18n, seo, table, field-validation, parity-happy-path) · helpers/
packages/shared-ts/
  package.json (+ test script, vitest) · vitest.config.ts
  lib/ api-failure/{types,to-api-failure,index}.ts · session/{parse,index}.ts · redaction.ts ·
       query/{keys,query-state,create-hooks,types}.ts   (+ *.test.ts each)
.github/workflows/ front-2-ci.yml · front-2-staging-deploy.yml
docs/guides/front-2/ index.md · conventions.md
docs/front-2-migration/staging-deploy.md
```

---

# Milestone M0 — Bootstrap, proven baseline & staging design

## Task M0.1: Scaffold `apps/front-2` (minimal buildable shell)

**Files:** Create `apps/front-2/{package.json,tsconfig.json,vite.config.ts,vitest.config.ts,.npmrc,server.mjs,scripts/assert-pinned.mjs,src/router.tsx,src/server.ts,src/routes.ts,src/routes/__root.tsx,src/routes/index.tsx,src/styles/app.css,src/env.d.ts}`; modify root `package.json` (format scripts), `turbo.json`. Reference: spike same-named files.

- [ ] **Step 1: Re-verify + pin TanStack Start.** `curl -s https://registry.npmjs.org/@tanstack/react-start | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['dist-tags']);print('router:',d['versions'][d['dist-tags']['latest']]['dependencies'].get('@tanstack/react-router'))"` → record + pin exact in `package.json`.
- [ ] **Step 2: Author a MINIMAL buildable shell** — do NOT copy the spike's `router.tsx`/`__root.tsx` wholesale (they import `DefaultCatchBoundary`, `NotFound`, `routeTree.gen`, `server/csp`, `lib/i18n.shared`, `server/i18n-locale`, `server/request-context`, `utils/seo` — none present yet). Write a stripped `__root.tsx` (HeroUI styled placeholder, no app-module imports), `index.tsx`, a minimal `router.tsx` (`getRouter` + Query integration, no SSR-query helpers that need missing modules), `server.ts` (CSP can come in M1.4 — for now a pass-through default stream handler), `routes.ts` (root + index only). Copy the config files (`vite.config.ts`, `vitest.config.ts`, `.npmrc`, `server.mjs`, `scripts/assert-pinned.mjs`) and add exact-pinned `@hookform/resolvers` + `@axe-core/playwright` to deps. Set `package.json name: "front-2"`; `tsconfig` `noUnusedLocals`/`noUnusedParameters` on.
- [ ] **Step 3: Add front-2 to root format scripts** (MAJOR-1): in root `package.json`, add `"apps/front-2/**/*.{js,jsx,ts,tsx,mjs,cjs,json,css}"` to both `format` and `format:write` globs.
- [ ] **Step 4: Lockfile flow (B2 fix).** `pnpm install` (non-frozen) to add the `apps/front-2` importer to `pnpm-lock.yaml`. Then `pnpm --filter @org/shared-ts run postinstall`.
- [ ] **Step 5: Verify.** `node apps/front-2/scripts/assert-pinned.mjs` → `All deps exact-pinned ✔`; `pnpm --filter front-2 build` → succeeds; `pnpm --filter front-2 typecheck` → exit 0; `PORT=3100 node apps/front-2/server.mjs &` then `curl -s localhost:3100 | grep -q "<html" && echo OK`; kill it; `pnpm install --frozen-lockfile --ignore-scripts` → "Already up to date".
- [ ] **Step 6: CI** `.github/workflows/front-2-ci.yml` (PR touching `apps/front-2/**` → assert-pinned → frozen `--ignore-scripts` install → shared-ts postinstall → build + typecheck).
- [ ] **Step 7: Commit** (include `pnpm-lock.yaml`): `git add apps/front-2 .github/workflows/front-2-ci.yml package.json turbo.json pnpm-lock.yaml && git commit -m "feat(front-2): M0.1 minimal buildable scaffold (pinned, CI, format scope, lockfile)"`

## Task M0.2: Characterization track kickoff (#693/#694)
Parallel track. (1) Land/confirm #694 design + #693 infra (Vitest+MSW+Playwright in `apps/front`); link to the Phase 1 epic. (2) Define the first characterization specs list (auth redirects, 401-split, zero token logging, URL state, table), authored against the M0.3 baseline. No code commit here unless this task owns #693/#694.

## Task M0.3: Browser baseline + 401 verification — HARD M0 EXIT GATE
- [ ] **Step 1:** Boot `apps/front` in a browser against seeded data (`just dev-db` + EF migrate/seed + `just dev-api` + `just dev-front`); resolve & record the Phase-0 `GET /login` exit root cause.
- [ ] **Step 2:** Capture (host Playwright, throwaway) the baseline: login redirect target; **auth-401 → no logout**; **authed-401 → logout**; **403 → no logout**; URL search-param state; staff-users render+search. Save as parity notes (not a committed suite).
- [ ] **Step 3:** Confirm `apps/front/src/lib/api-failure/to-api-failure.ts` is **body/problem-first** (`problemDetails.status ?? responseStatusCode ?? 500`) and `react-query/query-client.tsx` logs out only on 401 → **no back-port** (expected). If disproven → separate bug-fix PR + regression test.
- [ ] **Step 4: Commit doc only:** `git add docs/front-2-migration/parity-contract.md && git commit -m "docs(front-2): M0.3 current-app browser baseline + 401 verification"`. **GATE: M1 blocked until green.**

## Task M0.4: Staging deploy design artifact (+ explicit infra-input gate)
- [ ] **Step 1:** Write `docs/front-2-migration/staging-deploy.md` concretely: service names (`publyapp-front-2-staging`, `publyapp-api-staging`, staging Postgres), image scheme (`ghcr.io/radandevist/publyapp/front-2:<sha>` + `:staging`), the `dokploy.yml` delta, the `dotnet ef database update` migrate/seed job (mirror `apps/front-2-spike/docker-compose.test.yml` migrate stage), env-var **names** (`FRONT_URL`, `PUBLIC_API_BASE_URL`, `SERVER_API_BASE_URL`, session keys, DB conn), CSP `connect-src` + cookie domain, the Dokploy update **mechanism** (API/webhook redeploy), smoke command, rollback (redeploy previous `:<sha>`).
- [ ] **Step 2 — INFRA INPUT REQUIRED (Radan):** the actual **staging FQDNs** and the **Dokploy project/token (secret)** are human inputs. Record them as named GitHub Actions secrets + a `staging-deploy.md` "inputs" section; mark M1.5 **blocked** on these. (Surfaced to Radan, not a silent placeholder.)
- [ ] **Step 3:** Scaffold `.github/workflows/front-2-staging-deploy.yml` (build+push GHCR on merge touching `apps/front-2/**`, then Dokploy redeploy) — disabled until M1.5.
- [ ] **Step 4: Commit:** `git commit -m "docs(front-2): M0.4 staging design artifact + workflow scaffold (infra inputs flagged)"`

## Task M0.5: front-2 guide scaffold
Create `docs/guides/front-2/{index.md,conventions.md}` (HeroUI/Tailwind discipline, deferred custom lint rules as advisory, ports-and-adapters seam rule, authed=CSR, snake_case URL params). Commit.

## Task M0.6: Lint scoping for front-2
- [ ] **Step 1: Failing test:** MUI-only rules (`no-native-html-in-mui-surfaces`, `no-raw-mui-textfield-register`, `no-raw-img-in-product-surfaces`) flag under `apps/front/src` but NOT `apps/front-2/src`; portable rules (`no-console-in-source`, `no-direct-dayjs-in-components`) flag under BOTH.
- [ ] **Step 2: Run → fails** (portable rules hardcode `apps/front/src/`; see `no-console-in-source.js`, `no-direct-dayjs-in-components.js` `FRONT_SRC_PREFIX`).
- [ ] **Step 3: Implement** path-helper widening for portable rules → `apps/front-2/src`; ensure MUI-only rules stay scoped to `apps/front`. Config-level where possible (JS plugin alpha).
- [ ] **Step 4:** test passes; `pnpm lint` clean. Commit.

## Task M0.7: front-2 e2e harness — complete support stack (B6 / NEW-1 fix)
**Files:** Create `apps/front-2/playwright.config.ts`, `apps/front-2/docker-compose.test.yml`, `apps/front-2/traefik-dynamic.test.yml`, `apps/front-2/deploy/toxiproxy/toxiproxy.json`, `apps/front-2/e2e/helpers/*`. Reference (copy + path-fix): the same-named spike files + `apps/front-2-spike/deploy/toxiproxy/`.
- [ ] **Step 1: Copy the FULL support stack the harvested specs depend on** — the spike `docker-compose.test.yml` references `toxiproxy` + `traefik-dynamic.test.yml` (and the spike `e2e/log-leak.spec.ts` drives **toxiproxy fault injection** for the zero-token-logging sentinel). Copy/adapt `traefik-dynamic.test.yml` + `deploy/toxiproxy/toxiproxy.json` into `apps/front-2/`, fixing every spike path/hostname to front-2. (The `request-counter` sidecar is NOT needed — the `route-count` spec is out of Phase-1 scope; if it is added later, copy `deploy/request-counter/` then.)
- [ ] **Step 2:** Create `apps/front-2/docker-compose.test.yml` (front-2 image + seeded Postgres + migrate + API + toxiproxy + Traefik) with **front-2 paths/URLs** only.
- [ ] **Step 3:** Create `apps/front-2/playwright.config.ts` (baseURL `https://front-2.localhost:8443`, `ignoreHTTPSErrors`, chromium, no `webServer`); copy `e2e/helpers/login.ts` (path-fixed).
- [ ] **Step 4:** Document exact commands: `docker compose -f apps/front-2/docker-compose.test.yml up -d --build` → `pnpm --filter front-2 exec playwright test` → `docker compose -f apps/front-2/docker-compose.test.yml down -v`.
- [ ] **Step 5:** A trivial smoke spec + a toxiproxy-fault sanity check both pass against the local stack (proving the support artifacts are wired). Commit.

**M0 EXIT GATE:** scaffold builds + typechecks + frozen install clean; M0.3 baseline captured; M0.4 artifact written (infra inputs flagged); M0.5 guide + M0.6 lint + M0.7 harness green. No deploy.

---

# Milestone M1 — Staging-capable shell

## Task M1.1: Shared fold (ports-and-adapters) + shared-ts test infra
**Files:** Create `packages/shared-ts/vitest.config.ts` + `test` script in `packages/shared-ts/package.json`; `packages/shared-ts/lib/api-failure/{types,to-api-failure,index}.ts`, `lib/session/{parse,index}.ts`, `lib/redaction.ts`, `lib/query/{keys,query-state,create-hooks,types}.ts` (+ co-located `*.test.ts`); app adapters `apps/front-2/src/lib/api-client/client-manager.ts`, `apps/front-2/src/components/query-display.tsx`. Reference: `apps/front/src/lib/{api-failure,react-query,api-client,cookies}` (the canonical, current-app behavior), spike `lib/{api-failure,session-cookie,query,api-client}.ts`.

- [ ] **Step 1 (B3 fix): add shared-ts test infra.** Add exact-pinned `vitest` devDep + `"test": "vitest run"` script + `vitest.config.ts` to `packages/shared-ts`. Update lockfile + commit it. Verify `pnpm --filter @org/shared-ts test` runs (0 tests OK).
- [ ] **Step 2 (B5 fix): api-failure tests from CURRENT-APP behavior.** Write `to-api-failure.test.ts` asserting **body/problem-first** precedence (`problemDetails.status ?? responseStatusCode ?? 500`), matching `apps/front/src/lib/api-failure/to-api-failure.ts` — **do NOT port the spike's transport-first tests.** Cover 422 validation mapping. Run → fails.
- [ ] **Step 3:** Implement `api-failure/{types,to-api-failure}.ts` (pure, no React/MUI; logout/toast NOT here — injected at call sites). Tests pass.
- [ ] **Step 4:** `session/parse.ts` — pure functions over a cookie **string** → tokens + `selectToken(scope)`; no `document.cookie`/env/I/O. Failing test → implement → pass.
- [ ] **Step 5:** `redaction.ts` — `redactHeaders` masking `X-Session-Token`; test asserts token never appears. Implement.
- [ ] **Step 6 (B4 fix): scope-aware query contracts + seam.** `types.ts` defines the seam matching the real `ClientManager` surface: `interface ClientAccessor { getOrCreateClient(tenantId: string): ApiClient; getOrCreateStaffClient(): ApiClient; getOrCreateAnonymousClient(): ApiClient }` plus handler seam `{ onLogout, onToast, resolveTenant }` (types only). `keys.ts` (port `query-utils` key logic, type-only Query import), `query-state.ts` (`checkIfEmptyQueryData`). `create-hooks.ts`: port the `react-query-kit` factory from `apps/front/src/lib/react-query/create-hooks.ts`, replacing `getClientManager()` with the **injected `ClientAccessor`** — preserve the tenant/staff/anonymous call paths (`getOrCreateClient(tenantId)`, `getOrCreateStaffClient()`, `getOrCreateAnonymousClient()`). Contract tests for each scope. Failing → implement → pass.
- [ ] **Step 7 (peer-deps):** any shared `query/*` module importing `@tanstack/react-query`/`react-query-kit`/Kiota at **runtime** → add to `shared-ts` `peerDependencies`; prefer type-only to avoid peers. `pnpm --filter @org/shared-ts test` + build green.
- [ ] **Step 8: app adapters.** front-2 `client-manager.ts` (its own `env` + cookie reader via shared `session/parse`, exposing `getOrCreateClient`/`getOrCreateStaffClient`/`getOrCreateAnonymousClient`); HeroUI `query-display.tsx` consuming the shared `query-state` contract. Wire front-2 hooks via the shared factory + injected accessor.
- [ ] **Step 9:** `pnpm --filter @org/shared-ts test && pnpm --filter front-2 typecheck`. Commit (incl. lockfile): `git commit -m "feat(front-2): M1.1 ports-and-adapters shared fold + shared-ts test infra (scope-aware seam, current-app api-failure precedence)"`

## Task M1.2: App shell + nav + default theme + minimal Zustand
**Files:** `apps/front-2/src/components/app-shell/*`, `layouts/{marketing,auth,authed}-layout.tsx`, `lib/store/ui-store.ts`, theme in `styles/app.css` + `ThemeToggle`; e2e `apps/front-2/e2e/shell.spec.ts`.
- [ ] Build custom HeroUI shell + nav (Navbar removed in v3); authed `ssr:false`, marketing/auth SSR. Default HeroUI theme + brand primary; dark-mode via `useTheme` persisted (parity with `publyapp:color-scheme`). Minimal Zustand store (theme + sidebar only).
- [ ] **Acceptance (exact):** `pnpm --filter front-2 exec playwright test e2e/shell.spec.ts` green — asserts shell renders, toggle flips `documentElement` class, persists across `page.reload()`. Commit.

## Task M1.3: Auth/session + error views (the 401 split)
**Files:** `apps/front-2/src/routes/login.tsx`, `lib/server/session-actions.ts` (server-fn boundary), `components/error-views/{AppErrorView,View403,View404,LogoutRedirect}.tsx`, layout error boundaries; e2e `auth-error.spec.ts`. Reference: spike `login.tsx`, `server/session-actions.ts`, `components/{DefaultCatchBoundary,View403,LogoutRedirect}.tsx`; `docs/guides/error-views.md`; `apps/front/src/routes/{auth,authed}/_layout/*`.
- [ ] **Step 1: Failing e2e** for all four invariants: auth-401 **no logout** (stays + back-to-login), authed-401 **logout**, 403 **no logout** (any surface), 404 → View404.
- [ ] **Step 2:** Harvest auth/session (dual-token cookie, `beforeLoad` guard, login→set-cookie→redirect). Server fns obey the boundary (cookie I/O + the login session-set call; no app-data).
- [ ] **Step 3:** Port `AppErrorView` to HeroUI; ErrorBoundary placement per `error-views.md` (auth boundary 401-no-logout; authed boundary 401-logout via `LogoutRedirect`; shared 403/404). Inject logout/toast into the api-failure mapping here.
- [ ] **Step 4:** e2e green (4 invariants) + unit regression for the 401-only logout decision. Commit.

## Task M1.4: i18n SSR + CSP/nonce + SEO/meta + analytics
**Files:** `apps/front-2/src/lib/i18n.*`, `server/csp.ts` + real `server.ts`, `utils/seo.ts`, `lib/analytics.ts`; e2e `{csp,i18n,seo}.spec.ts` + `log-leak.spec.ts`. Reference: spike `lib/i18n.*`, `server/csp.ts`, `server.ts`, `utils/seo.ts`, `e2e/{csp,log-leak}.spec.ts`.
- [ ] **Step 1 (MAJOR-3): harvest i18n with cleanup** — fix spike-specific path/package assumptions (`i18n.server.ts` cwd/root resolution); add **locale-load unit tests** (FR resource resolves, unsupported→en). e2e: FR via cookie, `<html lang>`.
- [ ] **Step 2:** Harvest CSP/nonce into the real `server.ts` (nonce via `router.options.ssr.nonce`, headers on every status incl. 404). **Acceptance:** `playwright test e2e/csp.spec.ts e2e/log-leak.spec.ts` green.
- [ ] **Step 3:** SEO/meta baseline (canonical/OG/robots/sitemap/locale) in `seo.ts`. **Acceptance:** `e2e/seo.spec.ts` asserts tags present on `/` and `/login`.
- [ ] **Step 4:** `analytics.ts` wraps `@org/shared-ts/lib/analytics`; SSR bad-response capture mirroring `apps/front/src/entry.server.tsx`. Commit.

**M1 pre-staging EXIT GATE:** M1.1 `pnpm --filter @org/shared-ts test` + `pnpm --filter front-2 typecheck` green; M1.2–M1.4 e2e green via the **M0.7 harness** (`docker compose -f apps/front-2/docker-compose.test.yml up -d --build` → `playwright test` → `down -v`).

## Task M1.5a: front-2 production image
Harvest `apps/front-2/Dockerfile` from spike (root context, vite-native, `CMD ["node","server.mjs"]`). **Commit the Dockerfile first** (so a commit SHA exists), then build + push `ghcr.io/radandevist/publyapp/front-2:<sha>` tagged with **that** commit SHA (NEW-3: do not push a `:<sha>` that predates the commit).

## Task M1.5b: staging infra wiring (blocked on M0.4 infra inputs)
Add staging services to `dokploy.yml` (`publyapp-front-2-staging`, dedicated `publyapp-api-staging`, staging Postgres); staging API `FRONT_URL` = front-2 staging origin (single-origin CORS, isolated); migrate/seed job (`dotnet ef database update`); CSP `connect-src` + cookie domain. Requires the M0.4 FQDNs + Dokploy token secret. Commit.

## Task M1.5c: deploy workflow + smoke
Enable `front-2-staging-deploy.yml` (merge → build → Dokploy redeploy). Graduate spike `e2e/smoke.spec.ts` → run against `https://<staging-fqdn>/login`. **Acceptance:** post-deploy smoke green; rollback verified (redeploy previous `:<sha>`). Commit.

**M1.5 EXIT GATE:** staging live; deployed smoke green; rollback verified.

---

# Milestone M2 — Data & form systems

## Task M2.0: URL-state adapter (typed, snake_case)
**Files:** `apps/front-2/src/lib/url-state/{table-search-params,index}.ts` + `*.test.ts`. Reference: `apps/front/src/hooks/use-table-state.ts`.
- [ ] **Step 1: Failing test** for typed search params **`{ q, sort_id, sort_order, cursor, size }` (snake_case, per AGENTS.md)** parse/serialize round-trip via TanStack Router `validateSearch`. Include `size` (page size) — current cursor URL state carries it (`apps/front/src/hooks/use-table-state.ts`; `docs/guides/list-pages-search-filter-cursor-pagination.md`). (Note: the spike used camelCase `sortId`/`sortOrder` — do NOT copy that.)
- [ ] **Step 2:** Implement the typed table-state adapter; internal camelCase mapping only where needed. Tests pass. Commit.

## Task M2.0b: staff-users parity decision (MAJOR-5)
Decide (and record in `docs/front-2-migration/parity-contract.md`) for each known divergence: invite **dialog vs route**, **email column vs secondary text**, language switcher. Choose current-app parity or intentional divergence per item, with rationale. No code; doc commit. Blocks M2.3.

## Task M2.1: Table system
**Files:** `apps/front-2/src/components/table/*` + unit; e2e `table.spec.ts`. Reference: spike `members-table.tsx`; `apps/front/src/routes/authed/staff/staff-users/list/_parts/*`.
- [ ] Controller: columns + sort + **cursor-pagination parity** (match `use-staff-users-table-controller.impl.tsx` `paginationMode:'cursor'` + `hasNextPage`), search, bulk-selection scaffolding, density, keyboard a11y; consume M2.0 adapter; data via the M1.1 injected-client hooks.
- [ ] **Acceptance (exact):** `playwright test e2e/table.spec.ts` green — rows render, search filters, sort, cursor next/prev, `NO_MATCH` branch; `@axe-core/playwright` scan = 0 violations; keyboard nav reaches rows. Resize/pin/virtualization only if a parity surface needs them. Commit.

## Task M2.2: `Field.*` re-skin
**Files:** `apps/front-2/src/components/field/*` + unit; e2e `field-validation.spec.ts`. Reference: spike `components/{field-text,email-dialog}.tsx`; `apps/front` `Form`/`Field.*` API.
- [ ] RHF + Zod/InterZod wrappers over HeroUI inputs using `@hookform/resolvers`, mirroring the current `Form`/`Field.*` API.
- [ ] **Acceptance (exact):** `playwright test e2e/field-validation.spec.ts` green — invalid email → localized InterZod error (assert FR `e-mail non valide` + EN `Invalid email`), valid clears; axe scan 0 violations. Commit.

## Task M2.3: Staff-users beachhead + Phase-2 gate
**Files:** `apps/front-2/src/routes/authed/staff/staff-users/*`; extend `e2e/parity-happy-path.spec.ts` (harvest). Implements the M2.0b parity decisions.
- [ ] Assemble staff-users list (table + URL-state + shell + auth), deployed to staging.
- [ ] Wire the characterization suite (#693/#694) as the **Phase-2 fan-out gate** in CI; confirm green with the M0.3 baseline.
- [ ] **Acceptance:** `playwright test e2e/parity-happy-path.spec.ts` green against staging. Commit.

**M2 EXIT GATE (Phase 1 done):** staff-users production-grade at staging; characterization suite green + wired as Phase-2 gate; all foundation invariants preserved.

---

## Self-review checklist

- **Spec coverage:** D1–D12, M0–M2, §7 staging all map to tasks. ✔
- **Build/lockfile correctness:** M0.1 is a minimal buildable shell; lockfile updated non-frozen then frozen-verified; `pnpm-lock.yaml` committed. ✔
- **Seam correctness:** scope-aware `ClientAccessor` matches the real `ClientManager` (`getOrCreateClient`/`getOrCreateStaffClient`/`getOrCreateAnonymousClient`); shared modules stay pure. ✔
- **Precedence parity:** api-failure tests from current-app body/problem-first, NOT spike transport-first. ✔
- **Conventions:** snake_case URL params; front-2 in format/lint scope; server-fn boundary clarified; `client-ts` untouched. ✔
- **Acceptance:** every gate has an exact command + observable criterion; axe dep added. ✔
- **Known open input:** staging FQDNs + Dokploy token are an explicit INFRA INPUT (Radan), flagged not hidden. ✔
