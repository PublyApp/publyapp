# Implementation Plan: React Router v7 → TanStack Start Migration

**Issue:** #656
**Date:** 2026-06-12 (v2)
**Status:** ✅ **COMMITTED** — execution model is prep → proof → flip (no decision gates; the
checkpoints below are verification criteria, not reasons to idle).
Companion evaluation: `docs/spikes/2026-06-12-tanstack-start-migration-feasibility.md`.

**Strategy.** Phase 0 ships small behavior-preserving PRs on `develop` while RR7 keeps running.
Phase 1 is a throwaway **repo-local proof branch** that validates the exact pinned TanStack tuple
against this monorepo's sharp edges. Phase 2 is one short-lived atomic flip branch. Phase 3 is
the pre-merge verification matrix + post-merge cleanup. Every Phase 0 item is one PR; Phase 2
steps are sequential commits on the flip branch.

**Standing rules:** exact version pins for the whole TanStack tuple (no `^`); re-run all
inventories (Appendix C) at execution time; the migration is behavior-preserving — any product
change is a separate PR; **do not regress** 401 = logout / 403 ≠ logout, and the auth surface's
401-no-logout semantics.

---

## Phase 0 — Prep on `develop` (RR7 keeps shipping; each item = 1 PR)

Standing acceptance for every PR: `just tsc-front` clean, `just check-write` clean, app boots
(`just dev-front`), marketing + auth + one authed page smoke-checked, no intended behavior change.

### 0a — Upgrade `@tanstack/react-query` to ≥ 5.90.0
The lock currently resolves 5.82.0; `@tanstack/react-router-ssr-query@1.167.x` peers require
`>= 5.90.0`. Upgrade now under RR7 so any Query-side fallout is isolated from the flip.
**Acceptance:** 401-logout / 403-no-logout invariants manually verified; `react-query-kit`
factories type-check and run; list pages and mutations behave unchanged.

### 0b — Router façade (`#app/lib/router`)
Re-export the router APIs used outside route modules (`Link`, `Outlet`, `useNavigate`,
`useParams`, `useLocation`, `useSearchParams`, `redirect`, navigation types) and codemod
non-route-module imports (83 files import `react-router` today; route-module contract exports —
`loader`/`action`/`meta`/`ErrorBoundary` — stay put until the flip). Include the hidden router
dependencies: `RouterLink`, `ProgressBar` (navigation state), `usePathname`, `useHomePath`,
`useMatchPath`, `useTenantParam`, `useRouter`.
**Acceptance:** CI grep (or lint rule) forbids direct `react-router` imports outside
`src/lib/router/`, `src/routes/**`, and entry files.

### 0c — URL-state façade (`#app/lib/url-state`)
Audit the 14 nuqs-importing files + `use-table-state.ts`; expose the subset actually used
(parsers, `withDefault`, default-clearing, shallow routing) as repo-owned hooks delegating to
nuqs for now. Freeze current behavior — no filter redesigns.
**Acceptance:** no direct `nuqs` imports outside the façade; every list page's filters/sort/
pagination + deep links + back/forward verified manually.

### 0d — Extract framework-neutral cookie/session/locale helpers
Pull the logic out of `src/lib/react-router/server-data.server.ts` into request-agnostic helpers
(plain `Request`/header APIs): dual staff/tenant session-cookie parsing, Set-Cookie construction
(secure/samesite/path/max-age as today), legacy httpOnly clear, locale-cookie read +
`appLocales` validation, `InterZod` construction, safe Kiota client construction. RR wrappers
become thin shells over these helpers.
**Acceptance:** behavior identical under RR7; helpers have no `react-router` imports.

### 0e — Replace `remix-i18next` with in-repo glue
Re-implement locale detection + namespace resolution against plain Request/cookie APIs (drop the
RR `EntryContext` coupling in `init-i18n.server.ts`). Namespace policy: explicit per-route
metadata table (or load all current shared namespaces per request first — `common`, `zod`,
`response-message` — and optimize later). Remove the `remix-i18next` dependency.
**Acceptance:** view-source shows translated SSR output for both locales on `/` and `/login`; no
key-flash on hydration; `pnpm why remix-i18next` empty.

### 0f — Local `ClientOnly`; drop `remix-utils`
**Acceptance:** authed surface still client-only (view-source); `pnpm why remix-utils` empty.

### 0g — Frontend `/health` endpoint
`dokploy.yml` healthchecks `http://localhost:5050/health` but no frontend handler exists. Add an
Express handler (before the framework handler) in `server/app.ts`.
**Acceptance:** `curl localhost:5050/health` returns 200 in dev and prod-mode boot.

### 0h — Baselines & snapshots
Scripts (checked in or `.dump/`-documented) capturing: the RR route inventory; page titles/meta
for all routes (scripted curl); deep-link query-param behavior for each list page; bundle/chunk
listing; Lighthouse for `/`, `/login`, one authed page.
**Acceptance:** snapshots stored and re-runnable — they are the Phase 3 comparison baseline.

### 0i — Minimal Playwright smoke suite
The repo has no frontend test safety net; TypeScript will not catch CSP violations, cookie
regressions, hydration blank screens, or filter-serialization drift. Cover: `/` + `/login` SSR
content; login (cookie set) + logout; accept-invitation cookie path (if testable); authed
invalid-session → logout; 403 → no logout; one staff list with query-param deep link; 404/error
views; production server boot + `/health`; console-level CSP violation check.
**Acceptance:** suite runs green against RR7 locally (CI wiring optional at this stage).

---

## Phase 1 — Repo-local proof branch (throwaway; exit checklist is the deliverable)

Branch/worktree off `develop` after Phase 0a (Query upgrade) lands. Add the exact-pinned tuple
(`@tanstack/react-start`, `@tanstack/react-router`, `@tanstack/virtual-file-routes`,
`@tanstack/react-router-ssr-query`, `@tanstack/react-router-devtools`, `srvx`) and wire
`tanstackStart({ router: { virtualRouteConfig, routesDirectory: './src/routes', generatedRouteTree: './src/routeTree.gen.ts' } })`
with a PARTIAL route translation (marketing + auth + one authed staff list is enough). The branch
is discarded afterwards; its output is a findings note on issue #656.

**Exit checklist (all must pass before Phase 2 starts):**
- [ ] Dev server boots; first load, HMR, and hydration work in THIS pnpm monorepo on Vite 8
      (watch for #7418: `virtual:tanstack-start-client-entry` 404 / blank outlet). Keep
      `experimental.bundledDev` OFF (#7491).
- [ ] `#app/*` (package-imports + manual Vite alias) and `@org/shared-ts`/`@org/client-ts`
      resolve in all four contexts: route-tree generator, client build, SSR build, Node runtime
      (`server.js` importing the Start output). Route file targets stay inside `src/routes`
      (#4984 avoidance).
- [ ] Virtual route translation sample proves: `:param` → `$param`, splat/catch-all equivalent,
      layout nesting, `_parts`/`_components` excluded from generation without renames,
      feature-flagged marketing routes conditional in config.
- [ ] Custom Express works in dev (Vite middleware mode) and prod-mode boot, with helmet,
      compression, morgan, analytics middleware, static assets, and `/health` intact.
- [ ] CSP nonce carrier proven: helmet-generated per-request nonce reaches
      `createRouter({ ssr: { nonce } })`; every inline script (Start, query hydration, MUI
      color-scheme) carries it under the enforced policy (which keeps `style-src
      'unsafe-inline'` exactly as `packages/shared-ts/lib/csp.ts` does today). Fallback if the
      carrier is brittle: CSP header set from Start request middleware; helmet keeps non-CSP
      headers.
- [ ] Prerender of `/` and `/login` via plugin `pages` + `prerender.enabled`; static output
      inspected as files AND served through Express; static-nonce flow
      (`STATIC_PRE_RENDER_PATHS_MAP_NONCE`) aligned between HTML and header; no session-dependent
      state captured in `/login` output.
- [ ] `@tanstack/react-router-ssr-query` wired with per-request QueryClient; one suspense query
      streams; 401/403 global callbacks untouched.
- [ ] i18n: per-request i18next instance; translated view-source from the PRODUCTION build
      output (proves the `copyI18nFiles()`/fs-backend path in the new layout, not just dev).
- [ ] MUI v7 + Emotion (LTR) on an SSR page: no hydration mismatch, no FOUC at throttled 3G,
      portals styled. (RTL stays out of SSR scope — authed-only feature; optional recipe in
      Appendix E if that ever changes.)
- [ ] `vite build` output shape documented (expected `dist/client` + `dist/server/server.js`)
      for the deploy-script update in Phase 2.

---

## Phase 2 — Atomic flip branch (short-lived; merge `develop` daily)

### 2.1 Dependencies + build scaffold
Remove `react-router`, `react-router-dom`, `@react-router/{dev,express,node}`,
`react-router-devtools` (plus `nuqs` once 2.7 lands). Add the pinned tuple. Vite config: replace
`reactRouter()` + `reactRouterDevTools()` with `tanstackStart()`; **preserve** `copyI18nFiles()`,
`generateClient()`, `checker()`, `devtoolsJson()`, `optimizeDeps` includes, and the production
`ssr.noExternal` MUI list. Delete `react-router.config.ts`; prerender config per proof branch.
Scripts: `build` → `vite build`; `type-check` drops `react-router typegen`.

### 2.2 Typegen + tooling sweep (same commit-series as 2.1)
Remove `.react-router/types` tsconfig roots; route the 36 `./+types` consumers to TanStack route
API types (inventory first — root/layout/page/helper categories — no blind search-and-replace).
oxlint/formatter: drop `.react-router` ignores, add `src/routeTree.gen.ts` (respect its generated
headers). knip: update for removed/added deps and generated/virtual imports; run `just knip` only
once the build output has its final shape.

### 2.3 Virtual route config + root shell
Translate all `_tree/*.routes.ts` to `src/routes.virtual.ts` (full tree; conditional marketing
routes preserved). `src/routes/__root.tsx`: document shell (`<HeadContent />`, `<Scripts />`) +
provider stack ported from `root.tsx` (Emotion/MUI theme + settings, i18n, toasts, nprogress,
error shell per `docs/guides/error-views.md`); drop `NuqsAdapter`. `src/router.tsx`: per-request
`createRouter` with `ssr: { nonce }` + context `{ queryClient, locale }`. **Port-then-delete**
for entries: `entry.client.tsx`'s `requestIdleCallback` hydration delay + `NonceProvider`, and
`entry.server.tsx`'s analytics-on-bad-request + i18n init move into the Start equivalents
(custom client entry / server entry / `src/start.ts` global middleware) before the old files go.
Own the server entry explicitly (also mitigates #7285). Authed layout route: `ssr: false`.

### 2.4 Server-data façade + per-route conversion (marketing → auth → staff → tenant)
Build `createPublyServerFn` / `withPublyServerContext` on the Phase 0d helpers (request, locale,
zod, session/staff/tenant tokens, Kiota client, redirect/problem mapping) — authorization lives
in the server function/middleware, not only route guards. Then per section: `loader` →
`beforeLoad`/`loader`; `action`/`useFetcher` → server functions + Query mutations with explicit
pending/error/result mapping; `clientLoader` → client-only loaders; `meta` (26 files) → `head`;
`ErrorBoundary`/`useRouteError` → `errorComponent`/`notFoundComponent` mapped to `AppErrorView`
wrappers. **Auth actions are the riskiest conversion** — login + accept-invitation Set-Cookie
behavior, clear-session legacy-httpOnly POST, reset-password/verify-email fetcher semantics, and
the auth layout's server-vs-client cookie mismatch detection must match Appendix D exactly.
Delete `src/lib/react-router/*` when the last consumer converts.

### 2.5 Hooks/links + search params
Re-point `#app/lib/router` to `@tanstack/react-router`; fix typed `Link` fallout (`to` +
`params` objects — nav menus and breadcrumbs are the churn centers). `useParams` (27 files) →
typed route APIs. Re-implement `#app/lib/url-state` on `validateSearch` (zod) +
`Route.useSearch()`; schemas live on the list routes; verify against the 0h deep-link snapshots;
remove nuqs.

### 2.6 Query + devtools
`setupRouterSsrQueryIntegration({ router, queryClient })`, per-request QueryClient on the server;
the ~525-line global handlers port unchanged. Swap to `@tanstack/react-router-devtools`.

### 2.7 Express + deploy contract
`server/app.ts`: RR handler → `toNodeHandler(startEntry.fetch)`; middleware order, helmet, nonce
carrier, analytics, `/health` preserved; dev = Vite middleware mode. **Update `server.js`'s
server-bundle import path and `scripts/deploy.mjs`'s copy list to the Start output shape** (from
the proof branch findings); inspect the generated Docker context locally.

### 2.8 Flip-branch verification (before requesting review)
`just tsc-front` · `just check-write` · `just knip` · `pnpm --filter front build` ·
`node apps/front/server.js` (prod boot incl. `/health`) · deploy-context inspection · route
inventory diff vs 0h snapshot (zero missing/extra) · Playwright suite green · Phase 3 P0 rows
manually.

---

## Phase 3 — Pre-merge verification matrix + post-merge cleanup

### 3.1 Verification matrix (release blocker; staging deploy)

| # | Check | How |
|---|---|---|
| P0-1 | `/` + `/login` prerendered + SSR'd, translated, no user/session state embedded | view-source, both locales; inspect static files |
| P0-2 | Auth flows: login, signup, verify-email, reset-password, accept-invitation, logout, clear-session POST | Playwright + manual; cookie matrix (Appendix D) |
| P0-3 | Invalid/expired session on authed page → logout; 403 → error view, **no logout**; auth-surface 401 → no global logout; tenant-suspended clears hint cookie | manual + devtools |
| P0-4 | Every staff/tenant list page: filters/sort/pagination deep links, back/forward — diff vs 0h snapshots | Playwright + manual |
| P0-5 | CSP enforced, zero console violations; nonce on all inline scripts (incl. query hydration + MUI color-scheme); policy byte-identical to `csp.ts` intent | devtools + view-source |
| P0-6 | `curl -A Googlebot` returns full HTML for marketing pages | curl |
| P0-7 | Locale cookie flip changes SSR output; no key flash | view-source + throttled |
| P0-8 | RTL toggle in authed settings drawer | manual |
| P0-9 | `/health` 200 via the production server; Dokploy healthcheck passes on staging | curl + deploy |
| P1-1 | Titles/meta match the 0h snapshot | scripted curl diff |
| P1-2 | Error views: 404, thrown loader error, network failure → correct `AppErrorView` wrappers | manual |
| P1-3 | Lighthouse + bundle/chunk vs 0h baselines — no startup regression > 10% unexplained | Lighthouse |

### 3.2 Docs + dependency cleanup (post-merge PR)
AGENTS.md frontend sections (React Router v7 → TanStack Start; state-management table nuqs row →
router search params; `ClientOnly` wording → `ssr: false`); rewrite
`docs/guides/frontend-architecture.md`, `frontend-route-file-organization.md` (now describes
virtual-route conventions + `_parts`/`_components` exclusion), `error-views.md` (errorComponent
map); grep sweep for `react-router` mentions across `docs/` (Appendix C-3). Confirm every
removed dep is gone (`pnpm why` each); decide `isbot` (Start handles bots; analytics may still
want it) and `i18next-fetch-backend` deliberately.

### 3.3 Deploy + rollback
Dokploy staging deploy → verification matrix → production. Keep the last RR7 image tagged and
deployable; **rollback = redeploy previous image + revert the flip merge on `develop`** — test
the redeploy path once before cutover. No backend/API/data/infra change rides with the flip.

---

## Appendix A — Dependency delta (pin exact versions at flip time)

| Remove | Add (pinned) |
|---|---|
| `react-router`, `react-router-dom` | `@tanstack/react-router` |
| `@react-router/dev`, `@react-router/express`, `@react-router/node` | `@tanstack/react-start` |
| `react-router-devtools` | `@tanstack/react-router-devtools` (dev) |
| `remix-i18next` (gone after 0e) | `@tanstack/react-router-ssr-query` (requires Query ≥ 5.90 — see 0a) |
| `remix-utils` (gone after 0f) | `@tanstack/virtual-file-routes` |
| `nuqs` | `srvx` (Node fetch-handler adapter) |
| `isbot` (decide in 3.2) | — |

## Appendix B — API mapping

| RR7 | TanStack Start | Mechanical? |
|---|---|---|
| `routes.ts` + `_tree/*.routes.ts` code config | `src/routes.virtual.ts` (`rootRoute`/`route`/`index`/`layout` from `@tanstack/virtual-file-routes`) + generated `routeTree.gen.ts`; files stay in place, gain `createFileRoute()` exports | Yes (config); per-file export additions |
| `:param` / `*` path syntax | `$param` / Start splat conventions | Mostly (splat needs care) |
| `useParams()` | `Route.useParams()` / `useParams({ from })` | Mostly |
| `useNavigate()` / `<Link to>` | typed `useNavigate()` / `<Link to params>` | Mostly (nav components) |
| `useSearchParams` / nuqs | `validateSearch` (zod) + `Route.useSearch()` | No — schema design per route |
| `loader` (server) | `beforeLoad` + `loader` + `createServerFn` (authz in handler/middleware) | Per-route judgment |
| `clientLoader` | `loader` under `ssr: false` | Mostly |
| `action` + `useFetcher` | `createServerFn` + `useMutation` (explicit pending/result mapping); auth actions per Appendix D | Careful |
| `meta` export | `head` option + `<HeadContent />` | Yes |
| `ErrorBoundary`/`useRouteError` | `errorComponent`/`notFoundComponent` | Mostly |
| `./+types/*` imports (36 files) | route API types (`Route.useLoaderData` etc.) | Inventoried, not global-replace |
| `entry.server.tsx`/`entry.client.tsx` | server entry + `src/start.ts` middleware + optional client entry — **port requestIdleCallback delay, NonceProvider, analytics, i18n init first** | No — behavior port |
| `ClientOnly` (remix-utils) | built-in `ClientOnly` / route `ssr: false` | Yes |
| prerender (react-router.config.ts) | plugin `pages` + `prerender.enabled` (sibling options) | Yes |
| `react-router typegen` | plugin-generated route tree | Yes (CI scripts too) |
| `AppLoadContext` | router context + global middleware | Per-usage |

## Appendix C — Inventory commands (re-run at execution time)

```bash
# C-1: files importing react-router (83 on 2026-06-12)
rg -l "from 'react-router'" apps/front/src | wc -l
# C-2: route inventory (pre-flip) — diff against generated routeTree.gen.ts post-flip
rg -o "route\(['\"][^'\"]*|index\(|layout\(" apps/front/src/routes/_tree -g '*.routes.ts'
# C-3: docs mentioning react-router
rg -li 'react.router' docs/ AGENTS.md
# C-4: nuqs imports (14 files on 2026-06-12)
rg -l "from 'nuqs'" apps/front/src
# C-5: wrapper-layer consumers
rg -l "getServerLoader|getServerAction|getClientLoader" apps/front/src
# C-6: generated-type consumers (36 files on 2026-06-12)
rg -l "from ['\"]\./\+types" apps/front/src
```

## Appendix D — Auth-cookie regression matrix (release blocker)

| Flow | Must preserve |
|---|---|
| Login (`login-page.tsx` action) | `SESSION_TOKEN_COOKIE_KEY` Set-Cookie: value, secure, samesite, path, max-age/expiry; post-login redirect |
| Accept invitation | same Set-Cookie semantics + redirect |
| Clear-session (POST action route) | clears legacy httpOnly cookie variants; safe to call repeatedly |
| Auth layout mismatch detection | server-visible vs client-visible cookie divergence still triggers the clear-session path |
| Logout | cookie cleared + query cache reset + redirect |
| Expired/invalid session (authed) | 401 → centralized logout |
| Auth surface 401 | **no** global logout (per `error-views.md` invariant) |
| 403 anywhere | **no** logout; tenant-suspended 403 clears tenant hint cookie |

## Appendix E — Optional RTL/MUI streaming PoC (only if RTL ever reaches SSR surfaces)

Scaffold a Start app with MUI v7 + Emotion 11 matching repo versions; add the RTL cache exactly
as `right-to-left.tsx` (`createCache({ key: 'rtl', stylisPlugins: [rtlPlugin] })` +
`CacheProvider`) behind a toggle; one `ssr: true` and one `ssr: false` route; throttled-network
FOUC check, hydration-mismatch check, portal styling check, view-source style audit. Not needed
while RTL remains an authed-only (client-only) feature.

## Out of scope

Backend/API changes (none required; Kiota client untouched) · RSC adoption (experimental) ·
route renames, redesigns, or any behavior change (separate PRs) · CSP hardening beyond parity
(today's policy, including `style-src 'unsafe-inline'`, is preserved as-is).
