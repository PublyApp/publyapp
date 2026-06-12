# Implementation Plan: React Router v7 → TanStack Start Migration

**Issue:** #656
**Date:** 2026-06-12
**Status:** ⛔ **CONDITIONAL — do not execute before the spike gates pass.**
See `docs/spikes/2026-06-12-tanstack-start-migration-feasibility.md` §H: G1 (Start GA),
G2 (Phase 0 PoCs pass), G3 (scope sign-off). **Exception:** Phase 0 (PoCs) and Phase 1
(no-regret decoupling) may be executed any time — they are valuable independently of the verdict.

**Strategy:** Prep-then-flip. Phases 0–1 run as small PRs on `develop` with React Router v7 still
shipping; Phase 2 is one short-lived branch performing the atomic cutover; Phase 3 hardens and
cleans up. Every step below is sized to be one PR (or one commit inside the Phase 2 branch),
with acceptance criteria and verification commands.

**Estimates** assume solo-dev weekend-sized sessions. Re-validate all file inventories at
execution time (commands provided in Appendix C) — counts in this doc are a 2026-06-12 snapshot.

---

## Phase 0 — De-risking PoCs (2–3 days total; may run before GA)

Each PoC is an isolated throwaway app in a scratch directory (NOT in this repo; no PR). Output
of each = a short findings comment on issue #656 with PASS/FAIL per exit criterion.
Pin exact `@tanstack/*` versions in each PoC and record them in the findings.

### 0a — MUI v7 + Emotion + RTL cache + streaming SSR (1 day)

**Goal:** prove our exact styling stack survives Start's streaming SSR.

Steps:
1. Scaffold a minimal Start app (`pnpm create @tanstack/start` or copy `examples/react/start-material-ui`).
2. Upgrade to MUI **v7** + Emotion 11 (match `apps/front` versions); add `CssBaseline`, a themed
   page with portals (Menu, Dialog, Tooltip) and an `sx`-heavy data table.
3. Add the RTL Emotion cache exactly as `apps/front/src/lib/mui/theme/with-settings/right-to-left.tsx`
   does it (`createCache({ key: 'rtl', stylisPlugins: [rtlPlugin] })` + `CacheProvider`), behind a
   runtime toggle.
4. Add one route with `ssr: true` and one with `ssr: false`; toggle RTL on both.
5. Throttle network in devtools; watch for FOUC/style flashes; check view-source for emitted styles.

**Exit criteria (all must PASS):**
- [ ] No hydration mismatch warnings in console (LTR and RTL, both routes)
- [ ] No visible FOUC on the SSR route at throttled 3G
- [ ] Portal components styled correctly post-hydration
- [ ] RTL toggle works on the client-only route (this is our real product usage)
- [ ] If RTL + `ssr: true` fails but RTL + `ssr: false` passes → record PASS-WITH-CONSTRAINT
      (constraint: RTL stays an authed-surface-only feature — matches current product)

### 0b — i18next SSR glue (replacement for remix-i18next) (1 day)

**Goal:** prove cookie-locale detection + per-route namespace loading + no hydration flash.

Steps:
1. In the same or fresh PoC app: i18next + react-i18next + `i18next-fs-backend` (server).
2. Global request middleware (`createStart` / `requestMiddleware`) reading the locale cookie
   (replicate `LOCALE_COOKIE_KEY` semantics from `packages/shared-ts`); fall back to default locale.
3. Per-request i18next instance on the server (mirror `iniI18nOnServer` in `src/entry.server.tsx`);
   pass locale through router context.
4. Route-level namespace loading in `loader`s; client hydration with preloaded resources
   (no flash of translation keys).
5. Verify `lang` attribute + translated SSR output in view-source for both locales.

**Exit criteria:**
- [ ] View-source shows translated strings for the cookie-selected locale (no keys)
- [ ] No hydration mismatch; no flash-of-default-locale on slow network
- [ ] Namespace lazily loaded per route (network tab shows only needed namespaces)
- [ ] Locale switch (set cookie + reload) renders correctly server-side

### 0c — Express + helmet nonce → Start fetch handler (½ day)

**Goal:** prove our production server topology (Express 5 owns the port; helmet generates the
CSP nonce) can host Start.

Steps:
1. Express 5 app with helmet (per-request nonce in `res.locals`), morgan, compression — copy the
   middleware stack shape from `apps/front/server/app.ts` (helmet/nonce/analytics; morgan/compression are wired in `apps/front/server.js`).
2. Mount the Start server entry via `toNodeHandler` (`srvx/node`) as the terminal handler
   (pattern: `e2e/react-start/custom-basepath/express-server.ts` in TanStack/router).
3. Thread the helmet-generated nonce into Start's render: investigate `getGlobalStartContext()` /
   request headers as the carrier; pass to `createRouter({ ssr: { nonce } })` in `getRouter()`.
   ⚠️ This is the one **undocumented** integration (spike §B); if no clean carrier exists,
   fallback = generate the nonce inside Start's `getRouter()` and have an Express middleware read
   it back for the CSP header — or set the CSP header from Start middleware and drop helmet's CSP
   directive only (keep helmet for the other headers).
4. Verify dev mode also works (Vite middleware mode inside Express).

**Exit criteria:**
- [ ] All inline scripts + emitted assets carry the nonce; page passes a strict CSP (no `unsafe-inline`)
- [ ] helmet's non-CSP headers still present on responses
- [ ] Dev server (HMR) and prod build both function behind Express
- [ ] Document the chosen nonce-carrier pattern in the findings comment

---

## Phase 1 — No-regret decoupling on `develop` (RR7 keeps shipping)

Each item = one PR off `develop`, normal review flow, independently revertible. Order matters
only where noted. **Each PR's standing acceptance criteria (in addition to per-PR ones):**
`just tsc-front` clean; `just check-write` clean; app boots (`just dev-front`) with marketing,
auth, and one authed page manually smoke-checked; no behavior change intended.

### 1a — Router façade (`#app/lib/router`) — 2–3 PRs, split by section

**What:** create `src/lib/router/index.ts` re-exporting the router APIs used app-wide
(`Link`, `NavLink`, `Outlet`, `useNavigate`, `useParams`, `useLocation`, `useSearchParams`,
`redirect`, navigation types). Codemod all non-route-module imports of `react-router` to the
façade. Route-module contract exports (`loader`/`action`/`meta`/`ErrorBoundary`) stay as-is —
they are replaced wholesale in Phase 2.

**Why no-regret:** one import site to swap at flip time instead of ~83 files; also gives a place
to add deprecation notes steering new code.

**Inventory command:** see Appendix C-1 (83 files import `react-router` as of 2026-06-12).
**Acceptance:** an oxlint `no-restricted-imports`-style rule (or grep check in CI) forbids direct
`react-router` imports outside `src/lib/router/`, `src/routes/**` route modules, and entry files.

### 1b — URL-state façade over nuqs — 1–2 PRs

**What:** create `src/lib/url-state/` exposing the repo's own `useUrlState`/`useUrlStates` with
the subset of nuqs API actually used (audit the ~18 files first; expect parsers, `withDefault`,
shallow routing, `clearOnDefault`). Implementation today = delegate to nuqs. Codemod the ~18 call
sites.

**Why no-regret:** Phase 2 swaps the implementation to `Route.useSearch()` + `validateSearch`
without touching the ~18 call sites again; also documents exactly which URL-state features we
depend on.

**Acceptance:** no direct `nuqs` imports outside `src/lib/url-state/`; list pages (staff tenants,
users, invitations, profiles, audit logs) keep working filters/sort/pagination — manual check of
each list page + deep-link with query params + back/forward navigation.

### 1c — Replace `remix-i18next` with in-repo glue — 1 PR

**What:** re-implement the locale-detection + namespace-resolution layer in
`src/lib/i18n/server.ts` against plain Request/cookie APIs (the logic is small: read
`LOCALE_COOKIE_KEY` → validate against `appLocales` → fallback `defaultLocale`; resolve
namespaces per matched route). Drop the `remix-i18next` dependency. Keep behavior identical
under RR7.

**Why no-regret:** removes a Remix-only dependency that has no Start equivalent; the new glue is
written against `Request`, so Phase 2 reuses it nearly verbatim (per PoC 0b).

**Acceptance:** locale cookie flip renders SSR pages in the right language (view-source check
both locales on `/` and `/login`); no key-flash on hydration; `pnpm why remix-i18next` empty.

### 1d — Inline `remix-utils` usages — 1 small PR

**What:** audit `remix-utils` imports (primarily `ClientOnly`); replace with a local
`src/components/client-only.tsx` (or keep API-compatible wrapper). Drop the dependency.
**Acceptance:** authed surface still renders client-only (no SSR of authed layout —
view-source check); `pnpm why remix-utils` empty.

### 1e — Route-tree reshaping toward file-based conventions — 3–4 PRs, one per section

**What:** without leaving RR7 (code-based config keeps pointing at the moved files), reorganize
`src/routes/**` so each route module's path mirrors its future TanStack file-route path
(Appendix B conventions): one module file per route, layouts as future `route.tsx`/pathless
layouts, `_parts`/`_components` folders renamed/kept per the chosen ignore-prefix convention
(Start supports excluding non-route files via prefix/config — decide `-` prefix vs
`routeFileIgnorePattern` here and record it).

Split: (1) marketing + auth, (2) staff, (3) tenant, (4) actions/redirect stubs + error views.

**Why no-regret:** the Phase 2 flip diff becomes "change file contents", not "move 200 files and
change contents" — reviewable and bisectable. The reshape also forces resolution of every
"which file owns this route" question while RR7 still runs as the safety net.

**Acceptance per PR:** route inventory before/after identical (Appendix C-2 command); `just
tsc-front` clean; manual click-through of the section's pages; `docs/guides/frontend-route-file-organization.md`
updated in the same PR if a convention shifts.

### 1f — (Optional, anytime) Typed-route hygiene under RR7

**What:** ensure `react-router typegen` types are actually consumed where cheap (Route.LoaderArgs
etc.) so the Phase 2 conversion starts from typed loaders. Skip if effort exceeds a half-day.

---

## Phase 2 — The flip (single short-lived branch; target < 2 weeks wall-clock)

One branch `feat/tanstack-start-flip` off `develop`; steps below are sequential commits (or
stacked mini-PRs into the branch if review granularity is wanted). `develop` merges into the
branch daily. **The branch merges to `develop` only after the full Phase 3 smoke matrix passes.**

### 2.1 — Dependency + build scaffold swap

- Remove/add dependencies per Appendix A table (pin exact `@tanstack/*` versions).
- `vite.config.ts`: drop `reactRouter()` + `reactRouterDevTools()`; add `tanstackStart()`;
  keep `checker()`, `devtoolsJson()`, `copyI18nFiles()`, `generateClient()` plugins.
- Delete `react-router.config.ts`; configure prerender + SPA/SSR options on the plugin.
- `package.json` scripts: `build` → `vite build`; `type-check` → drop `react-router typegen`
  (route tree generation is part of the plugin/dev flow); dev/start stay on `server.js`.
- tsconfig: add generated `routeTree.gen.ts` handling per Start docs.
- **Checkpoint:** `pnpm build` produces `dist/client` + a server entry; app does not need to run yet.

### 2.2 — Root shell + router

- `src/routes/__root.tsx`: document shell (`<html>`/`<head>` via `<HeadContent />`, `<Scripts />`),
  provider stack ported from the current root route: Emotion cache + MUI theme + settings,
  i18n provider, toasts, nprogress, error boundary shell per `docs/guides/error-views.md`.
- `src/router.tsx`: `createRouter` per request; wire `ssr: { nonce }` (pattern from PoC 0c);
  router context carries `{ queryClient, locale, session-ish flags }`.
- `src/start.ts`: global request middleware — locale detection (from 1c glue), analytics
  hooks currently in `entry.server.tsx`/`server/app.ts`.
- Delete `src/entry.server.tsx` / `src/entry.client.tsx` (streaming, isbot, nonce are Start-native;
  custom client entry only if hydration customization proves necessary).

### 2.3 — File-based route tree

- Convert the reshaped tree (1e) to real route files: layouts → layout routes, pages → route
  files with `createFileRoute`, pathless groups for the three surfaces (marketing/auth/authed).
- Encode the full route inventory (Appendix C-2 snapshot taken at execution time) and verify the
  generated `routeTree.gen.ts` covers every path; add a route-inventory diff script as a
  temporary guard (old RR config inventory vs new tree).
- Authed root layout route: `ssr: false` (selective SSR) — replaces `ClientOnly` gating semantics
  (keep the component for inner islands if still needed).
- Marketing/auth routes: `ssr: true`; wire `head` exports (next step) and loaders.

### 2.4 — Loader / action / meta conversion (mechanical, per section)

For each of marketing → auth → staff → tenant:
- `loader` + `getServerLoader` → `beforeLoad` (auth/session checks via `createServerFn` with
  `getCookie`; redirects via `redirect({ to })`) and `loader` (data/i18n-namespace loading).
- `action` + `getServerAction` + `useFetcher` (8 call sites) → `createServerFn` invoked through
  TanStack Query `useMutation` (keep the existing mutation-hook conventions; centralized error
  handling via `ApiFailure` stays untouched).
- `clientLoader` + `getClientLoader` → route `loader` (runs client-side under `ssr: false`)
  calling the same query-prefetch helpers; keep the route-level cache-warming conventions documented in `docs/guides/frontend-architecture.md` (NB: AGENTS.md references `frontend-route-query-preloading.md`, which does not exist — resolve in Phase 3).
- `meta` exports (26 files) → `head` route option; centralize the title/description builders.
- `ErrorBoundary`/`useRouteError` (25 occurrences) → `errorComponent`/`notFoundComponent` mapped
  to the existing `AppErrorView` wrappers; **preserve the 401-no-logout invariant on the auth
  surface and the 403-must-not-logout invariant globally** (explicit acceptance criterion).
- Delete `src/lib/react-router/{server-data.server.ts,client-data.ts}` when the last consumer is
  converted.

### 2.5 — Hook/component swap via the façades

- `src/lib/router/index.ts` re-points to `@tanstack/react-router` equivalents; fix typed `Link`
  (`to` + `params`) fallout — expect most churn in nav components (8 `<Outlet>` render sites unaffected;
  `Link`-heavy nav/menus need `params` objects instead of interpolated strings).
- `useParams` (27 files): convert to `Route.useParams()`/`useParams({ from })` per route where
  types matter; a permissive façade shim is acceptable interim with a follow-up ratchet.
- `src/lib/url-state/` re-implemented on `validateSearch` + `Route.useSearch()` + `useNavigate`;
  define zod search schemas on the list routes (staff lists, audit logs, tenant posts).
  Drop the `NuqsAdapter` from providers; remove nuqs.

### 2.6 — Query-client integration

- `@tanstack/react-router-ssr-query`: `setupRouterSsrQueryIntegration({ router, queryClient })`;
  per-request QueryClient on the server (the 526-line `query-client.tsx` global handlers port
  unchanged — they are framework-agnostic).
- Verify 401 → centralized logout and 403 → no-logout still hold (unit of the smoke matrix).

### 2.7 — Express server rewire

- `apps/front/server/app.ts` (+ `server.js`): keep helmet/morgan/compression/analytics; replace the
  `@react-router/express` request handler with `toNodeHandler(startServerEntry.fetch)`;
  dev mode = Vite middleware mode (per PoC 0c).
- Nonce carrier per PoC 0c findings.
- Prerender config: `prerender: { pages: PRE_RENDER_PATHS }` equivalent on the plugin; confirm
  output artifacts and that `isPreRenderPath`-dependent logic (e.g. the
  `STATIC_PRE_RENDER_PATHS_MAP_NONCE` placeholder flow) is ported or retired deliberately.

### 2.8 — Devtools + lint/config sweep

- `react-router-devtools` → `@tanstack/react-router-devtools` (dev-only).
- oxlint config: retire the Phase 1a import-restriction rule or re-point it at
  `@tanstack/react-router`; update `publy/*` custom rules if any reference react-router modules.
- `knip` config: remove RR entries; run `just knip` to catch orphaned deps.
- Delete dead files: RR config, entries, old `_tree/*.routes.ts` once inventory diff is green.

### 2.9 — Flip-branch verification (before requesting review)

```
just tsc-front          # clean
just check-write        # clean
pnpm --filter front build   # client + server bundles
node apps/front/server.js   # prod-mode boot
just knip               # no orphans
```
Plus the route-inventory diff script (zero missing/extra routes) and a manual pass of the
Phase 3 smoke matrix's P0 rows.

---

## Phase 3 — Hardening, docs, deploy (after flip merges)

### 3.1 — Smoke matrix (release blocker; run on a staging deploy)

| # | Check | How |
|---|---|---|
| P0-1 | `/` and `/login` prerendered + SSR'd with translated content | view-source, both locales |
| P0-2 | Auth flows: login, signup, verify-email, reset-password, accept-invitation, logout | manual |
| P0-3 | Session semantics: expired/invalid session on authed page → logout; 403 → error view, **no logout** | manual + devtools |
| P0-4 | Staff + tenant surfaces: every list page (filters/sort/pagination deep links work, back/forward OK) | manual per list |
| P0-5 | CSP: zero violations in console with enforced policy; nonce on all inline scripts | devtools + view-source |
| P0-6 | Bot rendering: `curl -A Googlebot` gets full HTML for marketing pages | curl |
| P0-7 | i18n: locale cookie flip changes SSR output; no key flash | view-source + throttled load |
| P0-8 | RTL toggle in authed settings drawer | manual |
| P1-1 | Meta/SEO: titles + descriptions per route match pre-migration snapshot (capture before flip) | scripted curl diff |
| P1-2 | Error views: 404 route, thrown loader error, network failure → correct `AppErrorView` wrappers | manual |
| P1-3 | Perf: Lighthouse on `/`, `/login`, one authed page — no regression > 10% vs pre-flip baseline (capture before flip) | Lighthouse CI or manual |
| P1-4 | Tenant header flows: tenant switcher, suspended-tenant 403 handling clears hint cookie | manual |

### 3.2 — Docs updates (1 PR)

- `AGENTS.md`: Frontend Architecture section (React Router v7 → TanStack Start), state-management
  table (nuqs row → router search params), key-rules bullets (`getClientLoader` wrapper →
  new convention, `ClientOnly` wording → `ssr: false`).
- Rewrite/retitle: `docs/guides/frontend-architecture.md`,
  `docs/guides/frontend-route-file-organization.md`, `docs/guides/frontend-route-query-preloading.md` (referenced by AGENTS.md but currently MISSING from the repo — either create it or fix the AGENTS.md reference),
  `docs/guides/error-views.md` (ErrorBoundary placement map → errorComponent map).
- Grep sweep for `react-router` mentions across `docs/` (Appendix C-3) and update or annotate.

### 3.3 — Dependency removal + lockfile hygiene (part of 3.2 PR or separate)

- Confirm Appendix A "remove" column fully gone (`pnpm why` each); `i18next-fetch-backend` and
  `isbot` reviewed deliberately (isbot: Start handles bots internally, but analytics may still
  want it — decide and record).

### 3.4 — Deploy validation + rollback readiness

- Dokploy: deploy flip build to the VPS; verify Traefik routing, healthchecks, env vars
  (`AppEnvironment` untouched — frontend env reading unchanged unless server entry moved files).
- **Rollback plan:** previous RR7 Docker image stays tagged; rollback = redeploy previous image
  + `git revert` of the flip merge on `develop`. Test the redeploy path once before cutover.
- Keep the flip PR revertible: no destructive data/infra changes ride along with it.

---

## Appendix A — Dependency delta

| Remove | Add |
|---|---|
| `react-router`, `react-router-dom` | `@tanstack/react-router` (pinned) |
| `@react-router/dev`, `@react-router/express`, `@react-router/node` | `@tanstack/react-start` (pinned) |
| `react-router-devtools` | `@tanstack/react-router-devtools` (dev) |
| `remix-i18next` (already gone after 1c) | `@tanstack/react-router-ssr-query` |
| `remix-utils` (already gone after 1d) | `srvx` (for `toNodeHandler`) |
| `nuqs` | — (native `validateSearch`) |
| `isbot` (decide in 3.3 — Start bundles bot handling) | — |

## Appendix B — API mapping (conversion reference)

| RR7 | TanStack Start | Mechanical? |
|---|---|---|
| `route()/index()/layout()` code config | file-route conventions + generated `routeTree.gen.ts` | After 1e: yes |
| `useParams()` | `Route.useParams()` / `useParams({ from })` | Mostly |
| `useNavigate()` | `useNavigate()` (typed `to`/`params`) | Mostly |
| `useLocation()` | `useLocation()` | Yes |
| `useSearchParams` / nuqs | `validateSearch` (zod) + `Route.useSearch()` | No — schema design per route |
| `<Link to={string}>` | `<Link to="/x/$id" params={{ id }}>` | Mostly (nav components need care) |
| `Outlet` | `Outlet` | Yes |
| `loader` (server) | `beforeLoad` + `loader` + `createServerFn` | No — per-route judgment |
| `clientLoader` | `loader` under `ssr: false` | Mostly |
| `action` + `useFetcher` | `createServerFn` + `useMutation` | Mostly |
| `meta` export | `head` route option + `<HeadContent />` | Yes |
| `ErrorBoundary` / `useRouteError` | `errorComponent` / `notFoundComponent` | Mostly |
| `redirect()` | `redirect({ to, ... })` | Yes |
| `entry.server.tsx` streaming + isbot + nonce | built-in (`ssr.nonce` for nonce) | Yes (delete code) |
| `ClientOnly` (remix-utils) | route `ssr: false` / built-in `ClientOnly` | Yes |
| `prerender` (react-router.config.ts) | plugin `prerender.pages` | Yes |
| `react-router typegen` | plugin-generated route tree | Yes |
| `NuqsAdapter` provider | — | Yes (delete) |
| `AppLoadContext`/`getLoadContext` | router context + global middleware | Per-usage |

## Appendix C — Inventory commands (re-run at execution time)

```bash
# C-1: files importing react-router (façade codemod scope)
rg -l "from 'react-router'" apps/front/src | wc -l

# C-2: route inventory (run against RR config before/after reshaping & after flip)
rg -o "route\(['\"][^'\"]*" apps/front/src/routes/_tree -g '*.routes.ts'  # pre-flip
# post-flip: parse routeTree.gen.ts or `npx tsr routes` equivalent; diff the two lists

# C-3: docs mentioning react-router
rg -li 'react.router' docs/ AGENTS.md

# C-4: nuqs call sites
rg -l "from 'nuqs'" apps/front/src

# C-5: wrapper-layer consumers
rg -l "getServerLoader|getServerAction|getClientLoader" apps/front/src
```

## Out of scope

- Backend/API changes (none required; Kiota client untouched)
- RSC adoption (experimental in Start — explicitly excluded)
- Marketing redesigns, route renames, or behavior changes of any kind (migration must be
  behavior-preserving; anything else is a separate PR before or after)
