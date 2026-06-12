# Spike: TanStack Start Migration — Evaluation & Decision Record

**Issue:** #656
**Date:** 2026-06-12 (v2 — same day)
**Branch:** spike/656-tanstack-start-feasibility
**Decision: GO — committed.** Migration of `apps/front` from React Router v7 (framework mode) to TanStack Start will be executed per `docs/implementation-plans/tanstack-start-migration-plan.md`.

> **v2 changelog (2026-06-12):** merged a second, independent GPT evaluation (xhigh) with the
> original assessment. Major corrections vs v1: **virtual file routes** make a physical
> route-file restructure unnecessary (v1 wrongly treated it as forced); the React Query **peer
> mismatch** with `@tanstack/react-router-ssr-query` was missed; three Vite 8/pnpm-specific
> TanStack issues were added; the deploy-artifact contract and frontend `/health` gap were added;
> the RTL/MUI streaming risk was demoted; the GA gate was dropped — verdict changed from
> NOT-YET to **GO (committed by owner)** with verification criteria instead of decision gates.

---

## Context & Motivation

1. **Type-safe routing + ecosystem fit.** Typed paths, params, and search params end to end.
   The frontend already commits to the TanStack ecosystem (Query v5, Table, `react-query-kit`);
   routing is the largest remaining untyped surface (`useParams` across 27 files, URL state in
   14 nuqs-importing files, all stringly typed).
2. **Server functions / RPC model.** `createServerFn` with first-class cookie/header/session
   helpers replaces the hand-rolled `getServerLoader` / `getServerAction` / `getClientLoader`
   wrapper layer in `apps/front/src/lib/react-router/`.

---

## A. Current-State Inventory (snapshot 2026-06-12)

| Dimension | Fact |
|---|---|
| Framework | React Router **7.14.0** framework mode (`@react-router/{dev,express,node}` 7.14.0), SSR enabled |
| Route definition | **Code-based** config: `src/routes.ts` composing `_tree/*.routes.ts` (11 tree files); ~73 effective routes, ~77 `route()`/`index()`/`layout()` helper calls, 11 layouts, ~217 files under `src/routes/` |
| RR API surface | 83 files import `react-router`; `useParams` in 27 files; `<Outlet>` rendered in 8 layout/shell files; `ErrorBoundary`/`useRouteError` ~25 occurrences; `meta` exports 26 files; `useNavigate` 16×, `useLocation` 16×, `useFetcher` 8×, `useSearchParams` 6×, `useLoaderData` 2× |
| Generated types | `react-router typegen && tsc` for type-check; `tsconfig.json` rooted at `.react-router/types`; **36 files import generated `./+types`** |
| Data-loading wrappers | `getServerLoader` (~30–40 routes), `getServerAction` (~15–20), `getClientLoader` (~5–10) in `src/lib/react-router/{server-data.server.ts,client-data.ts}` — centralize locale detection, `InterZod`, session-cookie parsing (dual staff/tenant tokens), `requireUser` redirects |
| Server | Custom Express 5: `server.js` (trust proxy, static assets, compression/morgan, imports `./build/server/index.js`) + `server/app.ts` (helmet CSP + per-request `nanoid()` nonce, `STATIC_PRE_RENDER_PATHS_MAP_NONCE` for prerendered paths, analytics middleware, RR Express handler) |
| SSR | Streaming (`renderToPipeableStream`) in `src/entry.server.tsx` (isbot gating, per-request i18n init, analytics-on-bad-request); `src/entry.client.tsx` delays hydration via `requestIdleCallback` and wraps `NonceProvider` |
| SSR split | Marketing + auth SSR with server loaders; authed app client-only behind `ClientOnly` (from `remix-utils`), data via TanStack Query |
| Auth cookies | `login-page.tsx` and `accept-invitation-page.tsx` set `SESSION_TOKEN_COOKIE_KEY` via RR **actions**; `clear-session` POST action clears legacy httpOnly cookies; auth layout detects server-visible vs client-visible cookie mismatch |
| Prerender | `PRE_RENDER_PATHS = ['/', '/login']` (`packages/shared-ts/lib/constants.ts`) |
| CSP | Nonce-bearing CSP from helmet; policy **intentionally keeps `style-src 'unsafe-inline'`** (`packages/shared-ts/lib/csp.ts`) |
| i18n | i18next 24 + react-i18next + **remix-i18next** 7 (namespace discovery via RR `EntryContext`); cookie locale detection; `i18next-fs-backend` (server) / `i18next-fetch-backend` (client); `copyI18nFiles()` Vite plugin copies locale assets into the RR build layout (`build/client/tx`) |
| Styling | MUI **v7** + Emotion 11; user-toggleable RTL via custom Emotion cache (`stylis-plugin-rtl`, `src/lib/mui/theme/with-settings/right-to-left.tsx`); RTL toggle lives in the **authed** settings drawer |
| URL state | nuqs **2.4.3** (`nuqs/adapters/react-router/v7`; `NuqsAdapter` in `root.tsx`); 14 files import `nuqs` directly; list/table state flows through `use-table-state.ts` |
| Data layer | TanStack Query **5.x (lock resolves 5.82.0)** + `react-query-kit` 3 factories; ~525-line `query-client.tsx` with centralized **401 = logout / 403 ≠ logout** invariants and tenant-suspended handling |
| Build/deploy | Vite 8.0.12, `react-router build` → `build/client` + `build/server/index.js`; `scripts/deploy.mjs` copies `apps/front/build`, `server.js`, manifests, workspace skeletons into the Docker context; Dokploy on VPS; `dokploy.yml` healthchecks `http://localhost:5050/health` — **no frontend `/health` handler exists today** |
| Vite plugins to preserve | `copyI18nFiles()`, `generateClient()` (Kiota), `checker()`, `devtoolsJson()`, `optimizeDeps` includes, production `ssr.noExternal` MUI list |
| Aliases | `#app/*` via package imports **and** a manual Vite alias (not tsconfig-paths-only); workspace packages `@org/shared-ts`, `@org/client-ts` |
| Package coupling | **Zero** `react-router` imports in `packages/shared-ts` / `packages/client-ts` — blast radius confined to `apps/front` |
| Test safety net | No meaningful frontend test suite today (type-check + lint + manual smoke only) |

> Counts are a 2026-06-12 snapshot (commands in the plan's Appendix C); re-run before executing any phase.

---

## B. TanStack Start: Verified State (2026-06-12)

| Question | Answer | Source (date) |
|---|---|---|
| Version / stability | `@tanstack/react-start` 1.168.25 (2026-06-06); **RC, not GA** — official site labels Start "RC", advises pinning. No GA announcement through 2026-06-12 | tanstack.com/start/latest (fetched 2026-06-12) |
| Release cadence / repo health | Near-daily patches; 299 open issues / 283 open PRs on the monorepo | npm + GitHub API (2026-06-12) |
| Architecture | Vite plugin (`tanstackStart()`, post-Vinxi); Nitro optional; build emits a runtime-agnostic fetch-handler server entry | hosting guide (2026-06-12) |
| **Code-based routing** | **Not supported in Start** (maintainer: "code based routing is not supported"; closed not-planned 2025-12-02) | github.com/TanStack/router/issues/5808 |
| **Virtual file routes** | **Supported with Start.** `tanstackStart({ router: { virtualRouteConfig: './routes.ts' } })` is exercised by the official `e2e/react-start/virtual-routes` Playwright suite (maintained through 2026-06-06). API: `rootRoute`/`route`/`index`/`layout`/`physical` from `@tanstack/virtual-file-routes` (1.162.0); route files keep `createFileRoute()` (generator manages the path string) and live under a configurable `routesDirectory`. **Underdocumented**: neither the Start routing guide nor the virtual-file-routes page mentions the combination — cite the e2e suite. Community production use confirmed (discussion #5599, 2025-10-27) | github.com/TanStack/router `e2e/react-start/virtual-routes` (2026-06-12) |
| Custom Express server | Officially supported — Express serves assets and forwards dynamic requests to the server entry's fetch handler (`toNodeHandler` from `srvx/node`); official e2e example; dev = Vite middleware mode | hosting guide; `e2e/react-start/custom-basepath/express-server.ts`; discussion #3777 |
| Streaming SSR / bots | Built in — `renderToReadableStream`/`renderToPipeableStream`; `isbot` automatically awaits `stream.allReady` | `renderRouterToStream.tsx` (main, 2026-06-12) |
| CSP nonce | `router.options.ssr.nonce` applied to stream + assets; dedicated `e2e/react-start/csp` suite; inline-script gap #5511 closed fixed 2025-10-17. **Open design question for us:** the carrier from an Express/helmet-generated nonce into per-request `getRouter()` is unverified — proof-branch item | github.com/TanStack/router (2026-06-12) |
| Head/meta | Per-route `head` option + `<HeadContent />`; nested override | docs (2026-06-12) |
| Prerender | Supported; **current plugin shape: `pages` is a plugin-level sibling of `prerender`** (`tanstackStart({ prerender: { enabled, crawlLinks, autoStaticPathsDiscovery, ... }, pages: [...] })`) — verify exact typings at installed version | static-prerendering docs (2026-06-12) |
| Selective SSR | Per-route `ssr: true \| 'data-only' \| false`; child can only tighten — maps 1:1 to the `ClientOnly` authed surface | selective-ssr docs (2026-06-12) |
| Server functions | `createServerFn().validator().handler()`; per-fn + global middleware; full cookie/header/session helpers — httpOnly + non-httpOnly cookie read/write supported | server-functions + auth-server-primitives docs (2026-06-12) |
| React 19 / Vite 8 | Both supported (peer `react >=18`, `vite >=7`) | npm (2026-06-12) |
| TanStack Query | Official `@tanstack/react-router-ssr-query` (1.167.1): per-request QueryClient, dehydration/streaming; only `useSuspenseQuery`/loader prefetches SSR — plain `useQuery` stays client-side. **⚠ Peer requires `@tanstack/react-query >=5.90.0`; our lock resolves 5.82.0 → prep-PR upgrade required** | integrations/query docs + npm peers (2026-06-12) |
| Known issues biting our tuple | **#7418 (open):** `virtual:tanstack-start-client-entry` 404 → hydration failure in a **pnpm monorepo on react-start 1.168 + Vite 8** (exactly our stack). **#7491 (open):** Vite 8 `experimental.bundledDev` broken with Start — keep it off. **#7285 (closed):** SSR HMR `createStartHandler is not a function` — mitigated by owning the server entry. **#4984 (open):** virtual routes mis-resolve *package-alias* route file targets in monorepos — keep route file targets inside `src/routes` | GitHub issues (2026-06-12) |
| Migration guides | Official Router-level RR7 guide exists; no official RR7-framework-mode → Start guide; real-world writeups sparse | tanstack.com (2026-06-12) |
| Production adopters | Lovable (all new projects SSR on Start since 2026-05-13); HN Next.js→Start migration reports | lovable.dev; HN #47217978 |
| Supply chain | 2026-05-11 npm compromise of 42 `@tanstack/*` packages; fast, transparent response | postmortem blog |
| Devtools | `@tanstack/react-router-devtools` stable lockstep; unified devtools shell still 0.x | npm (2026-06-12) |

---

## C. Capability Mapping (RR7 → Start)

| Current (RR7) | Start equivalent | Status |
|---|---|---|
| Code-based route config (`routes.ts` + `_tree/*.routes.ts`) | **Virtual file routes**: translate the tree to `@tanstack/virtual-file-routes` helpers (`route`/`index`/`layout` map near-1:1); params `:tenantId` → `$tenantId`; splat/catch-all syntax differs (proof-branch item); `_parts`/`_components` excluded from route generation by explicit config; feature-flagged marketing routes stay conditional in the config. **No physical file moves required** | ✅ Near-1:1 translation |
| `useParams()` (untyped) | `Route.useParams()` / `useParams({ from })` (typed) | ✅ Upgrade |
| nuqs `useQueryState` | `validateSearch` (zod) + `Route.useSearch()` (typed) | ⚠️ Rewrite via façade (nuqs has no Start support) |
| `loader` via `getServerLoader` | `beforeLoad`/`loader` + `createServerFn`; **authorization must live in the server function/middleware, not only route guards** (Start auth docs) | ✅ Cleaner |
| `action` via `getServerAction` + `useFetcher` | `createServerFn` + Query mutations; auth actions (cookie-setting) are the riskiest conversion — dedicated regression matrix | ⚠️ Careful |
| `clientLoader` via `getClientLoader` | Route `loader` (client-only under `ssr: false`) | ✅ |
| `meta` export (26 files) | Route `head` option + `<HeadContent />` | ✅ Mechanical |
| `ErrorBoundary`/`useRouteError` | `errorComponent` / `notFoundComponent` mapped to `AppErrorView` wrappers per `docs/guides/error-views.md` | ✅ Mechanical |
| Generated `./+types` (36 files) + `.react-router/types` tsconfig roots + `react-router typegen` | `routeTree.gen.ts` + route API types; tsconfig/oxlint/knip ignore swap | ⚠️ Wide blast radius |
| `entry.server.tsx` / `entry.client.tsx` | Start server entry + router factory; **port behavior first, delete after proof** (requestIdleCallback hydration delay, NonceProvider, analytics-on-bad-request, i18n init are custom behavior, not framework boilerplate) | ⚠️ Port, don't drop |
| Custom Express server | Same Express app; Start fetch handler via `toNodeHandler`; middleware order preserved | ✅ Supported |
| `ClientOnly` (remix-utils) + authed client-only surface | Built-in `ClientOnly` + per-route `ssr: false` | ✅ Native |
| `prerender: PRE_RENDER_PATHS` | Plugin `pages` + `prerender.enabled`; static-nonce flow (`STATIC_PRE_RENDER_PATHS_MAP_NONCE`) must be re-proven | ⚠️ Nonce interaction |
| `remix-i18next` | None exists — own glue: per-request i18next instance, cookie locale policy, namespace loading per route (route static data or metadata table) | ⚠️ Custom work |
| `react-query-kit` factories | **Stay unchanged** — framework-agnostic; add small bridges for loader prefetch (`ensureQueryData`) | ✅ Keep |
| `react-router-devtools` | `@tanstack/react-router-devtools` | ✅ |

---

## D. Ecosystem Compatibility Matrix

| Library | Compatibility with Start | Evidence (date) |
|---|---|---|
| TanStack Query v5 | ✅ First-class — but **upgrade to ≥5.90.0 required** (ssr-query peer) | npm peers (2026-06-12) |
| react-query-kit 3 | ✅ keep — framework-agnostic; no documented conflicts (and no documented prior art) | npm (2026-06-12) |
| MUI v7 + Emotion 11 | ⚠️ Official TanStack example pins MUI **v6.4.7** with Emotion default insertion (streaming-safe); no v7 example, no v7 breakage reports. Proof-branch item (LTR SSR surfaces only) | examples/react/start-material-ui (2026-06-12) |
| RTL Emotion cache (`stylis-plugin-rtl`) | ❓ undocumented with streaming — **but structurally low-risk here**: RTL is an authed-surface setting and the authed subtree is `ssr: false`, so the RTL cache never streams. Only becomes a real risk if RTL ever reaches marketing/auth | analysis (2026-06-12) |
| nuqs 2.4.3 | ❌ for Start (adapter experimental, explicitly excludes Start; maintainer recommends native Router search APIs) | nuqs.dev/docs/adapters (2026-06-12) |
| remix-i18next 7 / remix-utils 8 | ❌ deps (Remix-specific) / ✅ capabilities (hand-rolled glue + built-in `ClientOnly`) | searched 2026-06-12 |
| zustand 4 / framer-motion 12 / react-hook-form 7 + zod | ✅ — standard SSR rules; client-only authed surface minimizes exposure | community (2025–2026) |
| i18next 24 core / Kiota client | ✅ — untouched | repo inspection |

---

## E. Risk Register (merged, re-weighted)

| # | Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|---|
| R1 | Start is RC with near-daily patches; breaking change pre-GA | Medium | Medium | **Exact pins** for the whole tuple (start/router/virtual-file-routes/ssr-query/devtools); no `^`; re-verify versions + issue search at flip time; lockfile diff review |
| R2 | **Vite 8 + pnpm dev hydration** (#7418 open: client-entry 404 → blank outlet on exactly our stack) | High | Medium | Proof branch boots dev + HMR + hydration **inside this repo** before any flip work; never declare feasibility from an external PoC |
| R3 | **React Query peer mismatch** (lock 5.82.0 < required 5.90.0) | High (if missed) | Certain | Dedicated prep PR upgrading Query; verify 401/403 invariants + react-query-kit factories under RR7 first |
| R4 | **Deploy artifact contract**: `scripts/deploy.mjs` copies `apps/front/build` + `server.js`; `server.js` imports `./build/server/index.js`; Start emits `dist/client` + `dist/server/server.js` (or `.output/...` under Nitro) | High | Certain | Deploy-script + server-import update is part of the atomic flip; inspect the generated Docker context locally pre-merge |
| R5 | **CSP nonce + prerender + query hydration**: Express/helmet-generated nonce carrier into `getRouter()` unverified; static-nonce placeholder flow for prerendered paths must align HTML ↔ header | High | Medium | Proof-branch item with view-source verification; fallback: CSP set from Start middleware, helmet keeps non-CSP headers; policy keeps `style-src 'unsafe-inline'` as today |
| R6 | **Auth cookie semantics regress** (login/accept-invitation set cookies in RR actions; clear-session legacy httpOnly path; server-vs-client cookie mismatch detection; 401-no-logout on auth surface, 403-no-logout globally) | High | Medium | Cookie regression matrix (plan Appendix D) is a release blocker; Playwright coverage |
| R7 | **Typegen blast radius** (36 `./+types` consumers, tsconfig roots, `react-router typegen` in scripts, oxlint/knip ignores) | High (effort) | Certain | Inventoried conversion, not search-and-replace; tooling-config swap in the same flip |
| R8 | i18n server resource paths break silently in built output (`copyI18nFiles`, fs-backend, `build/client/tx` layout) | Medium-high | Medium | Explicit i18n asset config for the Start layout; translated view-source check from the production build |
| R9 | Virtual-route monorepo alias bug (#4984 open) | Medium | Low (route files are in-app) | Keep virtual route file targets under `src/routes`; prove `#app/*` + `@org/*` in all four contexts (generator, client build, SSR build, Node runtime) |
| R10 | nuqs → `validateSearch` behavior drift (arrays, default-clearing, date ranges) in list filters | Medium | Medium | Façade first; deep-link snapshots before/after; per-page acceptance |
| R11 | Atomic flip blast radius (~73-route production app; no coexistence possible) | High | Certain | Prep + proof phases shrink the flip to mechanical conversions; daily develop merges; one revertable merge; tagged RR7 image |
| R12 | No frontend test safety net for a framework migration | High | Certain | Minimal Playwright smoke suite lands as prep, **before** the flip |
| R13 | MUI v7 / Emotion streaming on SSR surfaces (LTR) | Medium | Low-Medium | Proof-branch check (official v6 example as template); RTL explicitly out of SSR scope |
| R14 | Supply-chain exposure of fast-moving `@tanstack/*` | Medium | Low | Exact pins, delayed upgrades, lockfile review (2026-05-11 incident response was strong) |
| R15 | Code-splitting/chunking changes alter load profile | Medium | Medium | Pre-flip bundle + Lighthouse baseline; deliberate `autoCodeSplitting` decision; compare post-flip |

---

## F. Migration Shape

RR7 framework mode and Start cannot coexist in one app (both own the Vite build, route generation,
server entry, and document shell). Strategy — **prep → proof → flip**:

1. **Prep on `develop`** — small, behavior-preserving, independently-revertible PRs that are
   useful regardless of timing (Query upgrade, façades, framework-neutral helper extraction,
   `/health`, snapshots, Playwright).
2. **Repo-local proof branch** — a throwaway branch validating the exact pinned tuple against
   *this* monorepo's sharp edges (the v1 plan's external PoCs were a flaw: they cannot reproduce
   the pnpm workspace, `#app/*` aliases, Vite plugins, Express server, CSP constants, or deploy
   script).
3. **Atomic flip branch** — short-lived, merges `develop` daily, lands as one revertable unit
   only after the full verification matrix passes.

Rejected: big-bang long-lived branch (merge pain), parallel app behind Traefik (double infra for
a solo-maintained app), physical file-route restructure (unnecessary given virtual file routes).

---

## G. Effort Estimate (solo dev, weekend-sized slices)

| Phase | Content | Estimate |
|---|---|---|
| 0 | Prep PRs on develop (incl. Playwright + snapshots) | 3–5 weekend days |
| 1 | Repo-local proof branch | 1–2 weekend days |
| 2 | Atomic flip branch | 3–5 weekends |
| 3 | Verification, docs, deploy validation | 1–2 weekends |
| **Total** | | **~7–12 weekend days over 1.5–3 months** |

---

## H. Decision: GO (committed)

**Decision history, honestly recorded:** the v1 technical evaluation found no hard blocker but
recommended NOT-YET (RC status, unverified edges, atomic-flip blast radius). The owner overrode
on 2026-06-12: the migration is committed. A second independent evaluation (GPT, xhigh) was
merged the same day; it confirmed the no-blocker finding, corrected the forced-restructure claim
(virtual file routes), surfaced the Query peer mismatch and the Vite 8/pnpm issue list, and
re-weighted the risks toward dev-tooling/deploy/cookies/CSP rather than MUI/RTL streaming.

**Execution posture:** exact version pins (no `^` on the TanStack tuple), repo-local proof
branch before flip work, prep PRs that are valuable even standalone, one revertable flip, tagged
RR7 rollback image. The former "gates" are now **verification criteria** inside the plan:

- Proof branch passes its exit checklist (dev hydration on pnpm+Vite 8, alias proof, Express
  dev+prod, CSP nonce carrier, prerender+nonce, i18n from built output, MUI v7 LTR SSR)
- Cookie regression matrix green
- Full Phase 3 verification matrix green before the flip merges

**Watch items (not blockers):** Start GA announcement; nuqs Start adapter; official RR7→Start
migration guide; resolution of #7418/#7491/#4984.

---

## References

- TanStack Start docs (hosting, selective SSR, prerendering, server functions, auth primitives): <https://tanstack.com/start/latest> (fetched 2026-06-12)
- Virtual file routes: <https://tanstack.com/router/latest/docs/routing/virtual-file-routes>; package `@tanstack/virtual-file-routes`
- Virtual routes + Start e2e suite: <https://github.com/TanStack/router/tree/main/e2e/react-start/virtual-routes>
- Custom Express example: <https://github.com/TanStack/router/blob/main/e2e/react-start/custom-basepath/express-server.ts>; CSP e2e: <https://github.com/TanStack/router/tree/main/e2e/react-start/csp>
- Code-based routing not planned for Start: <https://github.com/TanStack/router/issues/5808>; virtual-routes-with-Start production report: discussion <https://github.com/TanStack/router/discussions/5599>
- Known issues: <https://github.com/TanStack/router/issues/7418> (pnpm+Vite8 client-entry 404, open), <https://github.com/TanStack/router/issues/7491> (bundledDev, open), <https://github.com/TanStack/router/issues/7285> (SSR HMR, closed), <https://github.com/TanStack/router/issues/4984> (monorepo alias, open), <https://github.com/TanStack/router/issues/5511> (nonce, fixed)
- Query integration: <https://tanstack.com/router/latest/docs/integrations/query>; `@tanstack/react-router-ssr-query` peer deps (npm, 2026-06-12)
- nuqs adapters (Start exclusion): <https://nuqs.dev/docs/adapters>
- MUI example: <https://github.com/TanStack/router/tree/main/examples/react/start-material-ui>; Emotion SSR: <https://emotion.sh/docs/ssr>
- Supply-chain postmortem: <https://tanstack.com/blog/npm-supply-chain-compromise-postmortem>
- Production adoption: <https://lovable.dev/blog/building-apps-using-tanstack-start>; HN <https://news.ycombinator.com/item?id=47217978>
