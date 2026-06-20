# Front-2 Phase 1 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a durable `apps/front-2` (TanStack Start + HeroUI v3) carrying the proven foundation layer — app shell, auth/session, error views, i18n SSR, CSP/nonce, theme, table system, `Field.*` — deployed continuously to staging, with the framework-agnostic core folded into `shared-ts` via injected seams.

**Architecture:** Fresh app, deliberate harvest from `apps/front-2-spike` (cleaned). Authed = CSR (`ssr:false`); marketing/auth = SSR. Direct-Kiota (no BFF); `createServerFn` = cookie-I/O only. Shared fold is **ports-and-adapters**: pure contracts in `shared-ts`, app-bound pieces (ClientManager, HeroUI renderers, env/cookies) stay app-local behind injected seams. Three milestones: M0 bootstrap+baseline+staging-design, M1 staging-capable shell, M2 data & form systems.

**Tech Stack:** TanStack Start 1.168.x (re-pin at M0), HeroUI v3.2.1, Tailwind v4, React 19, TanStack Query/Table, react-query-kit, RHF + Zod + InterZod, i18next, Kiota client (`@org/client-ts`), `@org/shared-ts`, Vitest + Playwright, srvx standalone Node, Dokploy/Traefik staging.

**Source-of-truth spec:** `docs/superpowers/specs/2026-06-20-front-2-phase-1-foundations-design.md` (Rev 3, reconciled).

---

## Conventions for every task

- Work on branch `feat/front-2-phase-1-<task-id>` off `develop`; one PR per task (or per milestone for tightly-coupled tasks), each with a linked sub-issue under the Phase 1 epic. **Never** push to `develop`.
- After any dependency change: `node apps/front-2/scripts/assert-pinned.mjs` must print `All deps exact-pinned ✔`.
- Commands run from repo root unless noted. Frontend type-check: `pnpm --filter front-2 typecheck`. Lint: `pnpm lint`.
- "Harvest from spike" = copy the named `apps/front-2-spike/...` file into `apps/front-2/...`, then apply the listed cleanups (rename, drop probe code, real deps). The spike stays untouched as reference.
- Do not commit secrets; staging env goes through Dokploy.

## File Structure

```
apps/front-2/
  package.json · tsconfig.json · vite.config.ts · vitest.config.ts · playwright.config.ts
  server.mjs · .npmrc · scripts/assert-pinned.mjs · README.md
  src/
    router.tsx · server.ts · routes.ts · env.d.ts
    routes/            __root.tsx · index.tsx · login.tsx · authed/* · marketing/*
    components/        app-shell/ · error-views/ (AppErrorView, View403, View404, LogoutRedirect) ·
                       field/ (Field.*) · table/ · query-display.tsx
    layouts/           marketing-layout.tsx · auth-layout.tsx · authed-layout.tsx
    lib/               api-client/ (client-manager.ts — app adapter) · i18n.* · url-state/ ·
                       analytics.ts · store/ (zustand) · server/ (server fns: cookie-I/O only)
    styles/app.css · utils/seo.ts
packages/shared-ts/lib/
    api-failure/ (types.ts, to-api-failure.ts, index.ts)        # pure
    session/ (parse.ts, index.ts)                               # pure
    redaction.ts                                                # pure
    query/ (keys.ts, query-state.ts, create-hooks.ts, types.ts) # contracts + injected-client factory
.github/workflows/front-2-staging-deploy.yml
docs/guides/front-2/ (index.md, conventions.md)
docs/front-2-migration/staging-deploy.md
```

---

# Milestone M0 — Bootstrap, proven baseline & staging design

## Task M0.1: Scaffold `apps/front-2` (fresh, cleaned harvest)

**Files:**
- Create: `apps/front-2/package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.npmrc`, `server.mjs`, `scripts/assert-pinned.mjs`, `src/router.tsx`, `src/server.ts`, `src/routes.ts`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/styles/app.css`, `src/env.d.ts`
- Reference (harvest source): the same-named files under `apps/front-2-spike/`

- [ ] **Step 1: Re-verify + pin TanStack Start (phase-boundary gate).**
  Run: `curl -s https://registry.npmjs.org/@tanstack/react-start | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['dist-tags']);print('router dep:',d['versions'][d['dist-tags']['latest']]['dependencies'].get('@tanstack/react-router'))"`
  Record the `latest` + its transitive `@tanstack/react-router` in the PR description. Pin those exact versions.

- [ ] **Step 2: Copy the spike skeleton, rename app.**
  Copy `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.npmrc`, `server.mjs`, `scripts/assert-pinned.mjs`, `src/router.tsx`, `src/server.ts`, `src/routes.ts`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/styles/app.css`, `src/env.d.ts` from `apps/front-2-spike/`. In `package.json` set `"name": "front-2"`; drop the `front-2-spike`-only Toxiproxy/request-counter/test-compose references.

- [ ] **Step 3: Apply cleanups (the spike's deferred shortcuts).**
  - Add exact-pinned `@hookform/resolvers` to `package.json` (replaces the spike's local zodResolver — used in M2.2).
  - In `tsconfig.json` turn `noUnusedLocals` and `noUnusedParameters` **on**.
  - Delete any probe routes/files if present; trim `__root.tsx` nav to Home/Login.
  - Rename anything containing "spike" in identifiers/paths.

- [ ] **Step 4: Workspace wiring.**
  Confirm `apps/*` glob picks up `front-2` (it does — no `pnpm-workspace.yaml` change). Add `front-2` build outputs to `turbo.json` if not already covered by the existing `dist/**` glob.

- [ ] **Step 5: Install + verify build/types/pins.**
  Run: `pnpm install --frozen-lockfile --ignore-scripts && pnpm --filter @org/shared-ts run postinstall`
  Run: `node apps/front-2/scripts/assert-pinned.mjs` → expect `All deps exact-pinned ✔`
  Run: `pnpm --filter front-2 build` → succeeds (emits `dist/client` + `dist/server`)
  Run: `pnpm --filter front-2 typecheck` → exit 0
  Run: `PORT=3100 node apps/front-2/server.mjs` then `curl -s localhost:3100 | grep -c "HeroUI\|<html"` → > 0; kill it.

- [ ] **Step 6: CI workflow (real, path-scoped).**
  Create `.github/workflows/front-2-ci.yml`: on PR touching `apps/front-2/**` → assert-pinned → frozen `--ignore-scripts` install → shared-ts postinstall → `pnpm --filter front-2 build` + `typecheck`. (Promotes the spike's supply-chain workflow to a real one.)

- [ ] **Step 7: Commit.**
  ```bash
  git add apps/front-2 .github/workflows/front-2-ci.yml turbo.json
  git commit -m "feat(front-2): M0.1 scaffold durable app (cleaned harvest, pinned, CI)"
  ```

## Task M0.2: Characterization track kickoff (#693/#694)

**Files:** per issues #693 (test infra: Vitest + MSW + Playwright) and #694 (design doc). This is a **parallel track**; this task only ensures it is *started* and unblocked.

- [ ] **Step 1:** Confirm/land the #694 design doc and the #693 infra (Vitest + MSW + Playwright in `apps/front`). If owned elsewhere, link the issues to the Phase 1 epic and note status.
- [ ] **Step 2:** Define the characterization suite's first specs list (auth redirects, 401-split, zero token logging, URL state, table) — these are *authored against the M0.3 baseline*.
- [ ] **Step 3:** No commit here beyond doc/issue links unless this task owns #693/#694 directly.

## Task M0.3: Browser baseline + 401 verification — HARD M0 EXIT GATE

**Files:**
- Create (throwaway, not committed): a short Playwright check against `apps/front`
- Document: `docs/front-2-migration/parity-contract.md` (append a "current-app browser baseline" subsection)

- [ ] **Step 1: Boot `apps/front` in a browser against seeded data.**
  Start seeded Postgres + API (`just dev-db`, EF migrate/seed, `just dev-api`) and `just dev-front`. Resolve the Phase-0 blocker (dev server exited on first `GET /login`) — capture the root cause.

- [ ] **Step 2: Capture the smoke baseline (host Playwright).**
  Record observed behavior for: login redirect target; **auth-surface 401 → no logout**; **authed 401 → logout**; **403 → no logout**; typed/URL search-param state on a list; staff-users table render + search. Save as the parity baseline (notes + selectors), NOT a committed throwaway suite.

- [ ] **Step 3: Verify the 401 mapping (D4).**
  Confirm `apps/front/src/lib/api-failure/to-api-failure.ts` maps `problemDetails.status ?? responseStatusCode ?? 500` and `apps/front/src/lib/react-query/query-client.tsx` logs out only on 401. Conclude **no back-port needed** (expected). If disproven, open a separate bug-fix PR with a regression test.

- [ ] **Step 4: Update parity contract + commit the doc only.**
  ```bash
  git add docs/front-2-migration/parity-contract.md
  git commit -m "docs(front-2): M0.3 current-app browser baseline + 401 verification"
  ```
  **GATE: M1 does not start until this baseline is captured and green.**

## Task M0.4: Staging deploy design artifact

**Files:**
- Create: `docs/front-2-migration/staging-deploy.md`
- Create (scaffold, no secrets): `.github/workflows/front-2-staging-deploy.yml` (skeleton; wired in M1.5)

- [ ] **Step 1: Write the concrete staging runbook** (`staging-deploy.md`): exact service names (`publyapp-front-2-staging`, `publyapp-api-staging`, staging Postgres), domains (`front-2-staging.<domain>`, `api.front-2-staging.<domain>`), image tag scheme (`ghcr.io/radandevist/publyapp/front-2:<sha>` + `:staging`), the `dokploy.yml` delta, the `dotnet ef database update` migrate/seed job (mirror `apps/front-2-spike/docker-compose.test.yml` migrate stage), env vars (`FRONT_URL`, `PUBLIC_API_BASE_URL`, `SERVER_API_BASE_URL`, session keys, DB conn), CSP `connect-src` + cookie domain, smoke URL, rollback (redeploy previous `:<sha>`).
- [ ] **Step 2: Scaffold the deploy workflow** (build+push GHCR on merge touching `apps/front-2/**`, then trigger Dokploy redeploy) — leave the Dokploy hook/token as a referenced secret placeholder; do not enable until M1.5.
- [ ] **Step 3: Commit.**
  ```bash
  git add docs/front-2-migration/staging-deploy.md .github/workflows/front-2-staging-deploy.yml
  git commit -m "docs(front-2): M0.4 staging deploy design artifact + workflow scaffold"
  ```

## Task M0.5: front-2 guide scaffold

**Files:** Create `docs/guides/front-2/index.md`, `docs/guides/front-2/conventions.md`

- [ ] **Step 1:** Create `docs/guides/front-2/` with the stack-scoped conventions: HeroUI/Tailwind discipline, the deferred custom lint rules as **advisory** (`no-server-fn-for-app-data`, React-Aria-protected-API), the ports-and-adapters seam rule, authed=CSR. Note: legacy `apps/front` guides stay authoritative until cutover.
- [ ] **Step 2: Commit.** `git commit -m "docs(front-2): M0.5 stack-scoped guide scaffold"`

## Task M0.6: Lint scoping for front-2

**Files:**
- Modify: `.oxlintrc.json`; rules under `packages/lint-ts/src/rules/` (path guards); `packages/lint-ts/` rule tests
- Test: a config/rule test proving scoping

- [ ] **Step 1: Write the failing scoping test.**
  Add a test asserting (a) MUI-only rules (`no-native-html-in-mui-surfaces`, `no-raw-mui-textfield-register`, `no-raw-img-in-product-surfaces`) DO flag a sample under `apps/front/src` but do NOT flag the same code under `apps/front-2/src`; (b) portable rules (`no-console-in-source`, `no-direct-dayjs-in-components`) DO flag under BOTH `apps/front/src` and `apps/front-2/src`.
- [ ] **Step 2: Run it → fails** (portable rules hardcode `apps/front/src/` — see `no-console-in-source.js`, `no-direct-dayjs-in-components.js` `FRONT_SRC_PREFIX`; MUI rules vary).
- [ ] **Step 3: Implement.** Widen the portable rules' path helpers to also match `apps/front-2/src`; ensure MUI-only rules stay scoped to `apps/front/src` (add a guard to any non-scoped one). Keep changes config-level where possible (JS plugin is alpha).
- [ ] **Step 4: Run test → passes;** run `pnpm lint` clean.
- [ ] **Step 5: Commit.** `git commit -m "feat(lint): M0.6 scope MUI rules to front, extend portable rules to front-2 (+tests)"`

**M0 EXIT GATE:** scaffold builds + typechecks; M0.3 baseline captured; M0.4 staging artifact written; M0.5 guide scaffolded; M0.6 lint scoping green. No deploy yet.

---

# Milestone M1 — Staging-capable shell

## Task M1.1: Shared fold (ports-and-adapters)

**Files:**
- Create (pure, shared): `packages/shared-ts/lib/api-failure/{types.ts,to-api-failure.ts,index.ts}`, `packages/shared-ts/lib/session/{parse.ts,index.ts}`, `packages/shared-ts/lib/redaction.ts`, `packages/shared-ts/lib/query/{keys.ts,query-state.ts,create-hooks.ts,types.ts}`
- Test: a co-located `*.test.ts` for each shared module
- Create (app adapters): `apps/front-2/src/lib/api-client/client-manager.ts`, `apps/front-2/src/components/query-display.tsx`
- Reference: spike `apps/front-2-spike/src/lib/{api-failure,session-cookie,query,api-client}.ts`; app sources `apps/front/src/lib/{api-failure,react-query,api-client,cookies}`

- [ ] **Step 1: api-failure (pure) — write failing tests.**
  Port the spike's `api-failure.test.ts` cases into `packages/shared-ts/lib/api-failure/to-api-failure.test.ts` (status precedence: `problemDetails.status ?? responseStatusCode ?? 500`; strict integer parse; 422 validation mapping). Run → fails (module absent).
- [ ] **Step 2: api-failure — implement.** Port `ApiFailure` union (`types.ts`) + `toApiFailure` (`to-api-failure.ts`) from the spike, **with no React/MUI imports**. The mapping takes the raw error only; logout/toast are NOT here (they are injected at the call site). Run tests → pass.
- [ ] **Step 3: session (pure) — failing test then implement.** `parse.ts`: pure functions over a cookie **string** → `{ staffToken, tenantToken }` + a selector `selectToken(scope)`. No `document.cookie`, no env, no I/O. Port from spike `session-cookie.ts` keeping only the pure parsing; cookie *reading* is an injected seam. Tests pass.
- [ ] **Step 4: redaction (pure) — failing test then implement.** `redaction.ts`: `redactHeaders(headers)` that masks `X-Session-Token` (and any value matching the token). Tests assert the token never appears in output.
- [ ] **Step 5: query contracts — failing tests then implement.**
  - `keys.ts`: the `getQueryKey` builder (port `apps/front/src/lib/react-query/query-utils.ts` key logic — type-only Query import).
  - `query-state.ts`: `checkIfEmptyQueryData` predicate (port from `query-utils`).
  - `types.ts`: `QueryClientAccessor` seam interface `{ getClient(): ApiClient }` and the handler seam `{ onLogout, onToast, resolveTenant }` (types only).
  - `create-hooks.ts`: the hook-factory generic adapted to take an **injected** `getClient` (NOT `getClientManager` from an app). Port the `react-query-kit` factory shape from `apps/front/src/lib/react-query/create-hooks.ts`, replacing the `#app/...client-manager` import with the injected accessor param.
- [ ] **Step 6: peer-deps.** If any shared `query/*` module imports `@tanstack/react-query`/`react-query-kit`/Kiota at **runtime** (not type-only), add them to `packages/shared-ts/package.json` `peerDependencies` (+ `peerDependenciesMeta` optional as appropriate). Prefer type-only imports to avoid peers. Run `pnpm --filter @org/shared-ts test` + build.
- [ ] **Step 7: front-2 app adapters.**
  - `apps/front-2/src/lib/api-client/client-manager.ts`: front-2's `ClientManager` (its own `env` + cookie reader using shared `session/parse` + a browser/SSR cookie source), exposing `getClient()` to satisfy the seam.
  - `apps/front-2/src/components/query-display.tsx`: HeroUI renderer consuming the shared `query-state` contract (replaces the MUI `apps/front` QueryDisplay).
  - Wire front-2's hooks via the shared factory + injected `getClient`.
- [ ] **Step 8: typecheck + commit.**
  `pnpm --filter @org/shared-ts test && pnpm --filter front-2 typecheck`
  ```bash
  git commit -m "feat(front-2): M1.1 ports-and-adapters shared fold (pure core in shared-ts + app adapters)"
  ```

## Task M1.2: App shell + nav + default theme + minimal Zustand

**Files:**
- Create: `apps/front-2/src/components/app-shell/*`, `apps/front-2/src/layouts/{marketing-layout,auth-layout,authed-layout}.tsx`, `apps/front-2/src/lib/store/ui-store.ts`, theme wiring in `src/styles/app.css` + a `ThemeToggle`
- Test: `apps/front-2/e2e/shell.spec.ts` (renders, dark-mode toggle persists)

- [ ] **Step 1:** Build the custom HeroUI app shell (Navbar removed in v3) + nav; authed layout `ssr:false` (CSR), marketing/auth SSR.
- [ ] **Step 2:** Default theme: HeroUI stock + brand primary; dark-mode toggle via `useTheme`, persisted (cookie/localStorage parity with current `publyapp:color-scheme`).
- [ ] **Step 3:** Minimal Zustand store (`ui-store.ts`): theme + sidebar/settings state (mirror what `apps/front` authed layout initializes — no more).
- [ ] **Step 4:** e2e: shell renders; toggle flips + persists across reload. Run green.
- [ ] **Step 5: Commit.** `git commit -m "feat(front-2): M1.2 app shell + nav + default theme + ui store"`

## Task M1.3: Auth/session + error views (the 401 split)

**Files:**
- Create: `apps/front-2/src/routes/login.tsx`, `src/lib/server/session-actions.ts` (cookie-I/O only), `src/components/error-views/{AppErrorView,View403,View404,LogoutRedirect}.tsx`, error boundaries in the three layouts
- Test: `apps/front-2/e2e/auth-error.spec.ts`
- Reference: spike `login.tsx`, `server/session-actions.ts`, `components/{DefaultCatchBoundary,View403,LogoutRedirect}.tsx`; guide `docs/guides/error-views.md`; app layouts `apps/front/src/routes/{auth,authed}/_layout/*`

- [ ] **Step 1: Write failing e2e** asserting the invariants: auth-surface 401 → **no logout** (stays, shows view + back-to-login); authed 401 → **logout**; 403 → **no logout** (any surface); 404 → View404.
- [ ] **Step 2:** Harvest the spike auth/session (dual-token cookie, `beforeLoad` guard, login → set cookie → redirect). `createServerFn` = cookie I/O only.
- [ ] **Step 3:** Port `AppErrorView` to HeroUI; wire ErrorBoundary placement per `error-views.md`: auth-layout boundary (401 no-logout), authed-layout boundary (401 logout via `LogoutRedirect`), shared 403/404 views. Logout/toast handlers injected into the shared api-failure mapping here.
- [ ] **Step 4:** Run e2e → green (all four invariants). Add a unit regression for the 401-only logout decision.
- [ ] **Step 5: Commit.** `git commit -m "feat(front-2): M1.3 auth/session + AppErrorView (auth-401 no-logout, authed-401 logout, 403 no-logout)"`

## Task M1.4: i18n SSR + CSP/nonce + SEO/meta + analytics

**Files:**
- Create: `apps/front-2/src/lib/i18n.*` (harvest), `src/server/csp.ts` + `src/server.ts` (harvest), `src/utils/seo.ts` (harvest+extend), `src/lib/analytics.ts`
- Test: `apps/front-2/e2e/{csp,i18n,seo}.spec.ts`, `log-leak.spec.ts` (harvest)
- Reference: spike `lib/i18n.*`, `server/csp.ts`, `server.ts`, `utils/seo.ts`, `e2e/{csp,log-leak}.spec.ts`

- [ ] **Step 1:** Harvest i18n SSR (cookie-driven locale, `en` fallback, `<html lang>`, InterZod global error map). e2e: FR via cookie, unsupported → en.
- [ ] **Step 2:** Harvest CSP/nonce (custom `server.ts`, nonce via `router.options.ssr.nonce`, headers on every status incl. 404). Harvest the CSP + log-leak e2e suites. Run green.
- [ ] **Step 3:** SEO/meta baseline for marketing/auth SSR: canonical, OG, robots, sitemap, locale meta (`seo.ts`). e2e asserts presence on `/` and `/login`.
- [ ] **Step 4:** Analytics carry: `analytics.ts` wraps `@org/shared-ts/lib/analytics` (PostHog); add SSR bad-response capture mirroring `apps/front/src/entry.server.tsx`.
- [ ] **Step 5: Commit.** `git commit -m "feat(front-2): M1.4 i18n SSR + CSP/nonce + SEO/meta baseline + analytics"`

**M1 pre-staging EXIT GATE:** M1.1–M1.4 unit + e2e green **locally against the spike compose harness** (`apps/front-2-spike/docker-compose.test.yml` adapted, or a front-2 compose) as the integration oracle until staging exists.

## Task M1.5: Staging standup (execute the M0.4 artifact)

**Files:**
- Modify: `dokploy.yml` (add staging services), `.github/workflows/front-2-staging-deploy.yml` (enable)
- Create: `apps/front-2/Dockerfile` (harvest from spike, root context, `CMD node server.mjs`)

- [ ] **Step 1:** Harvest the front-2 Dockerfile (vite-native build, srvx `server.mjs`). Build + push `ghcr.io/radandevist/publyapp/front-2:<sha>`.
- [ ] **Step 2:** Add staging services to `dokploy.yml` per `staging-deploy.md`: `publyapp-front-2-staging`, dedicated `publyapp-api-staging`, staging Postgres; staging API `FRONT_URL` = front-2 staging origin (single-origin CORS, isolated). Configure staging secrets in Dokploy.
- [ ] **Step 3:** Wire the migrate/seed job (`dotnet ef database update`) against staging DB.
- [ ] **Step 4:** Enable the deploy workflow (merge → build → Dokploy redeploy). Set CSP `connect-src` + cookie domain for staging.
- [ ] **Step 5:** Graduate the spike `e2e/smoke.spec.ts` → run against `https://front-2-staging.<domain>/login` post-deploy.
- [ ] **Step 6: Commit.** `git commit -m "feat(front-2): M1.5 staging standup (GHCR + dokploy staging services + migrate job + smoke)"`

**M1.5 EXIT GATE:** staging live; deployed smoke green against the staging URL; rollback path verified (redeploy previous `:<sha>`).

---

# Milestone M2 — Data & form systems

## Task M2.0: URL-state adapter (typed search params)

**Files:**
- Create: `apps/front-2/src/lib/url-state/{table-search-params.ts,index.ts}`
- Test: `apps/front-2/src/lib/url-state/table-search-params.test.ts`
- Reference: `apps/front/src/hooks/use-table-state.ts` (nuqs/MRT pattern being replaced)

- [ ] **Step 1: Failing test** for a typed search-param schema (q, sortId, sortOrder, cursor) parse/serialize round-trip using TanStack Router's `validateSearch`.
- [ ] **Step 2: Implement** the typed-search-param table-state adapter (replaces the nuqs pattern; strategy chose TanStack typed search). Tests pass.
- [ ] **Step 3: Commit.** `git commit -m "feat(front-2): M2.0 typed URL search-param table-state adapter"`

## Task M2.1: Table system (mini-spec)

**Files:**
- Create: `apps/front-2/src/components/table/*` (HeroUI Table + `@tanstack/react-table` controller)
- Test: `apps/front-2/e2e/table.spec.ts` + unit for the controller
- Reference: spike `components/members-table.tsx`; current `apps/front/src/routes/authed/staff/staff-users/list/_parts/*`

- [ ] **Step 1:** Build the controller: columns + sort + **cursor pagination parity** (match `use-staff-users-table-controller.impl.tsx` `paginationMode: 'cursor'` + `hasNextPage`), search, bulk-selection scaffolding, density, keyboard a11y. Consume the M2.0 URL-state adapter.
- [ ] **Step 2:** Wire to data via the shared injected-client query hooks (M1.1).
- [ ] **Step 3:** e2e (against staging or local): rows render, search filters, sort, cursor next/prev, `NO_MATCH` branch, axe + keyboard pass. Resize/pin/virtualization only if a parity surface needs them (current app does not).
- [ ] **Step 4: Commit.** `git commit -m "feat(front-2): M2.1 HeroUI + TanStack table system (cursor parity, a11y)"`

## Task M2.2: `Field.*` re-skin

**Files:**
- Create: `apps/front-2/src/components/field/*` (`Field.Text`, `Field.Select`, … + `Form` wrapper)
- Test: `apps/front-2/e2e/field-validation.spec.ts` + unit
- Reference: spike `components/{field-text,email-dialog}.tsx`; current `apps/front` `Form`/`Field.*` API

- [ ] **Step 1:** Build RHF + Zod/InterZod wrappers over HeroUI inputs using `@hookform/resolvers` (the real resolver added in M0.1), mirroring the current `Form`/`Field.*` API so Phase-2/3 pages port mechanically.
- [ ] **Step 2:** e2e: invalid email → localized InterZod error (FR + EN); valid clears. a11y pass.
- [ ] **Step 3: Commit.** `git commit -m "feat(front-2): M2.2 Field.* re-skin (RHF + Zod/InterZod on HeroUI)"`

## Task M2.3: Staff-users beachhead + Phase-2 gate wiring

**Files:**
- Create: `apps/front-2/src/routes/authed/staff/staff-users/*`
- Test: extend `apps/front-2/e2e/parity-happy-path.spec.ts` (harvest from spike)

- [ ] **Step 1:** Assemble the staff-users list surface from the table + URL-state + shell + auth (production-grade, deployed to staging).
- [ ] **Step 2:** Wire the characterization suite (#693/#694) as the **Phase-2 fan-out gate** in CI; confirm it is green with the M0.3 baseline.
- [ ] **Step 3: Commit.** `git commit -m "feat(front-2): M2.3 staff-users beachhead at staging + characterization gate"`

**M2 EXIT GATE (Phase 1 done):** staff-users runs production-grade on front-2 at staging; characterization suite green and wired as the Phase-2 gate; all foundation invariants preserved.

---

## Self-review checklist (run before execution)

- **Spec coverage:** every spec item (D1–D12, M0–M2, §7 staging) maps to a task above. ✔
- **Seam discipline:** M1.1 keeps app-bound code (ClientManager, HeroUI QueryDisplay, env/cookies) out of `shared-ts`; only pure modules graduate. ✔
- **Gate ordering:** M0.3 baseline gates M1; M1 pre-staging gate then M1.5 staging gate; staging-dependent e2e (M2.1/M2.3) run after M1.5. ✔
- **No placeholders:** each task has files, commands, and acceptance. ✔
- **Type/name consistency:** `getClient` seam name used in M1.1 + M2.1; `front-2` package name throughout. ✔
