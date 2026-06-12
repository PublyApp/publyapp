# Spike: TanStack Start Migration Feasibility (Frontend)

**Issue:** #656
**Date:** 2026-06-12
**Author:** spike/656-tanstack-start-feasibility
**Decision needed:** GO / NOT-YET / NO-GO on migrating `apps/front` from React Router v7 (framework mode) to TanStack Start
**Verdict: NOT-YET (conditional GO)** — see §H for gates

---

## Context & Motivation

Two motivations drive this evaluation (in priority order):

1. **Type-safe routing + ecosystem fit.** TanStack Router provides statically typed paths, params,
   and search params. The frontend already commits heavily to the TanStack ecosystem
   (TanStack Query v5, TanStack Table, `react-query-kit`); routing is the largest remaining
   untyped surface (`useParams` usage across 27 files, all stringly typed).
2. **Server functions / RPC model.** TanStack Start's `createServerFn` (with built-in
   cookie/header/session helpers) is a first-class replacement for the hand-rolled
   `getServerLoader` / `getServerAction` / `getClientLoader` wrapper layer in
   `apps/front/src/lib/react-router/`.

This spike is docs-only. No implementation occurs regardless of verdict.

---

## A. Current-State Inventory (as of 2026-06-12)

| Dimension | Fact |
|---|---|
| Framework | React Router **7.14.0** framework mode (`@react-router/{dev,express,node}` 7.14.0), SSR enabled |
| Route definition | **Code-based** config: `src/routes.ts` + `src/routes/_tree/*.routes.ts` (11 tree files) |
| Scale | ~73 `route()`/`index()` calls, 11 layout components, ~217 files under `src/routes/` |
| RR API surface | 83 files import `react-router`; `useParams` in 27 files, `<Outlet>` rendered in 8 layout/shell files, `ErrorBoundary`/`useRouteError` ~25 occurrences, `meta` exports 26 files, `useNavigate` 16×, `useLocation` 16×, `useFetcher` 8×, `useSearchParams` 6×, `useLoaderData` 2× |
| Data-loading wrappers | `getServerLoader` (~30–40 routes), `getServerAction` (~15–20), `getClientLoader` (~5–10) in `src/lib/react-router/{server-data.server.ts,client-data.ts}` |
| Server | Custom Express 5 (`server.js` + `server/app.ts`; helmet/nonce/analytics live in `server/app.ts`, morgan/compression are wired in `server.js`): helmet CSP + per-request nonce, morgan, compression, analytics middleware |
| SSR | Streaming (`renderToPipeableStream`) in `src/entry.server.tsx`; `isbot` gates `onShellReady` vs `onAllReady`; per-request i18n init; per-request nonce |
| SSR split | Marketing + auth pages SSR with server loaders (session-cookie validation, redirects); authed app is client-only behind `ClientOnly` (from `remix-utils`), data via TanStack Query |
| Prerender | `PRE_RENDER_PATHS = ['/', '/login']` (`packages/shared-ts/lib/constants.ts:390`) |
| i18n | i18next 24 + react-i18next + **remix-i18next** 7; cookie-based locale detection (`LANGUAGE_DETECTION_METHOD = cookie`); `i18next-fs-backend` (server) / `i18next-fetch-backend` (client); namespaces loaded per route |
| Styling | MUI **v7** + Emotion 11; **user-toggleable RTL** via custom Emotion cache with `stylis-plugin-rtl` (`src/lib/mui/theme/with-settings/right-to-left.tsx`); RTL toggle lives in the authed settings drawer |
| URL state | nuqs **2.4.3** with `nuqs/adapters/react-router/v7` (~18 files using `useQueryState`/`useQueryStates`) |
| Data layer | TanStack Query v5 + `react-query-kit` 3 hook factories (`createStaffQuery`, `createTenantQuery`, …); ~525-line `query-client.tsx` with centralized 401/403 semantics (401 = logout, 403 ≠ logout — do-not-regress invariant) |
| Build/deploy | Vite 8, `react-router build` → `build/client` + `build/server/index.js`; Express serves both; Dokploy → Docker on VPS |
| Package coupling | **Zero** `react-router` imports in `packages/shared-ts` / `packages/client-ts` — blast radius confined to `apps/front` |

> Counts are a 2026-06-12 snapshot (commands in the plan's Appendix C); treat as approximate and re-run before executing any phase.

---

## B. TanStack Start: State of the Union (verified 2026-06-12)

| Question | Answer | Source (date) |
|---|---|---|
| Version / stability | `@tanstack/react-start` 1.168.25 (pub. 2026-06-06); **RC, not GA** — official site labels Start "RC", advises pinning. v1 RC announced 2025-09-23. No GA announcement exists through 2026-06-12. | tanstack.com/start/latest (fetched 2026-06-12); tanstack.com/blog/announcing-tanstack-start-v1 (2025-09-23) |
| Release cadence | Near-daily patches (15 releases of react-start 2026-05-24 → 2026-06-06) | npm registry (2026-06-12) |
| Repo health | 299 open issues / 283 open PRs on TanStack/router monorepo | GitHub API (2026-06-12) |
| Architecture | Plain Vite plugin (`tanstackStart()`, post-Vinxi); Nitro optional; build emits a runtime-agnostic fetch-handler server entry | tanstack.com/start/latest/docs/framework/react/guide/hosting (fetched 2026-06-12) |
| Custom Express server | **Officially supported** — "Express or any other custom Node.js server works too, as long as it serves the client assets and calls the server entry's fetch handler." Official e2e example wraps the handler with `toNodeHandler` from `srvx/node`; dev mode = Vite middleware mode inside Express | hosting guide (2026-06-12); github.com/TanStack/router `e2e/react-start/custom-basepath/express-server.ts`; discussion #3777 |
| Streaming SSR | Yes — `renderToReadableStream` with `renderToPipeableStream` Node fallback | `packages/react-router/src/ssr/renderRouterToStream.tsx` (main, 2026-06-12) |
| Bot handling | Built in — imports `isbot`; bots automatically await `stream.allReady` (full HTML) | same source file |
| CSP nonce | Supported — `router.options.ssr.nonce` applied to stream + assets; dedicated `e2e/react-start/csp` suite generates a fresh nonce per request inside `getRouter()`; inline-script nonce gap #5511 closed fixed 2025-10-17 | github.com/TanStack/router (2026-06-12) |
| Head/meta | Per-route `head` option (`title`/`meta`/`links`/`scripts`) + `<HeadContent />`; nested routes override by name | docs: document-head-management (2026-06-12) |
| Prerender | Explicit page list (`prerender.pages[]`) + optional link crawling; non-prerendered routes keep SSR — covers `PRE_RENDER_PATHS` exactly | docs: static-prerendering (2026-06-12) |
| Selective SSR | Per-route `ssr: true \| 'data-only' \| false`; child can only tighten. Maps 1:1 to our `ClientOnly` authed surface | docs: selective-ssr (2026-06-12) |
| Server functions | `createServerFn().validator().handler()`; per-fn + global middleware; full cookie/header/session helpers (`getCookie`, `setCookie`, `getRequestHeader`, …) — httpOnly session-cookie reading directly supported | docs: server-functions; `packages/start-server-core/src/request-response.ts` (2026-06-12) |
| **Code-based routing** | **NOT supported in Start** — maintainer-confirmed ("code based routing is not supported", issue closed 2025-12-02). File-based routing effectively required; "virtual file routes" exist as a middle ground | github.com/TanStack/router/issues/5808 (2025-11-10) |
| React 19 / Vite 8 | Both supported (peer deps `react >=18`, `vite >=7`; official example pins react ^19, vite ^8.0.14) | npm registry + start-basic example (2026-06-12) |
| TanStack Query | Official `@tanstack/react-router-ssr-query`: per-request QueryClient via router context, dehydration/hydration, streaming of queries resolving during SSR; only `useSuspenseQuery`/loader prefetches participate in SSR — plain `useQuery` stays client-side (matches our authed model) | docs: integrations/query (2026-06-12) |
| Migration guides | Official **Router-level** RR7 guide exists (scoped to router swap, "2–4 h"); official **Start-level** guide covers Next.js only; RR7-framework-mode → Start guide "coming soon". Real-world RR7→Start production writeups: none found | tanstack.com/router/latest/docs/how-to/migrate-from-react-router (2026-06-12) |
| Production adopters | Lovable: all new projects SSR on Start since 2026-05-13 (Cloudflare Workers, prerendered marketing routes). HN 2026-03-03: Next.js→Start migration report (strangler via nginx), no Start-specific production failures reported | lovable.dev/blog/building-apps-using-tanstack-start; news.ycombinator.com/item?id=47217978 |
| Security incident | 2026-05-11 npm supply-chain compromise of 42 `@tanstack/*` packages (Router/Start monorepo only; Query unaffected); detected in ~20–26 min, deprecated within 1.5 h; transparent postmortem | tanstack.com/blog/npm-supply-chain-compromise-postmortem |
| Devtools | `@tanstack/react-router-devtools` 1.167.0 (stable, lockstep); unified `@tanstack/react-devtools` shell still 0.x | npm registry (2026-06-12) |

---

## C. Capability Mapping (RR7 feature → Start equivalent)

| Current (RR7) | Start equivalent | Status |
|---|---|---|
| Code-based route config (`routes.ts` + `_tree/*.routes.ts`) | File-based route tree (`src/routes/**` conventions, generated `routeTree.gen.ts`) | ⚠️ Forced restructure |
| `useParams()` (untyped) | `Route.useParams()` / `useParams({ from })` (typed) | ✅ Upgrade |
| nuqs `useQueryState` | `validateSearch` (zod) + `Route.useSearch()` (typed) | ⚠️ Rewrite (~18 files); nuqs has no Start support |
| `loader` via `getServerLoader` (cookie/session checks, redirects) | `beforeLoad`/`loader` + `createServerFn` with cookie helpers | ✅ Cleaner |
| `action` via `getServerAction` + `useFetcher` | `createServerFn` + TanStack Query mutations | ✅ Cleaner |
| `clientLoader` via `getClientLoader` (query prefetch) | Route `loader` (isomorphic; client-only under `ssr: false`) + query integration | ✅ |
| `meta` export (26 files) | Route `head` option + `<HeadContent />` | ✅ Mechanical |
| `ErrorBoundary`/`useRouteError` exports | `errorComponent` / `notFoundComponent` route options | ✅ Mechanical (error-views guide must be re-mapped) |
| `entry.server.tsx` (streaming, isbot, i18n, nonce) | Server entry + `createStartHandler(defaultStreamHandler)`; isbot/streaming built in; nonce via `ssr.nonce`; i18n hand-rolled | ⚠️ i18n glue is custom work |
| Custom Express server (`server.js`, helmet, analytics) | Same Express app; Start handler mounted via `toNodeHandler(serverEntry.fetch)` | ✅ Supported |
| `ClientOnly` (remix-utils) + authed client-only surface | `<ClientOnly>` (built into @tanstack/react-router) + per-route `ssr: false` | ✅ Native |
| `prerender: PRE_RENDER_PATHS` | `tanstackStart({ prerender: { pages: [...] } })` | ✅ |
| `react-router typegen` | Route tree auto-generated by the Vite plugin | ✅ |
| `NuqsAdapter` (react-router/v7) | — (dropped with nuqs) | ⚠️ |
| `remix-i18next` | None exists — hand-rolled middleware + loader-based namespace loading | ⚠️ Custom work |
| `react-router-devtools` | `@tanstack/react-router-devtools` | ✅ |

---

## D. Ecosystem Compatibility Matrix

| Library (current) | Compatibility with Start | Evidence (date) |
|---|---|---|
| TanStack Query v5 | ✅ First-class (`@tanstack/react-router-ssr-query`) | official docs (2026-06-12) |
| react-query-kit 3 | ✅ likely — framework-agnostic, emits standard v5 query options; **no documented prior art with Start** (absence of evidence, not evidence of issues) | npm peer deps (2026-06-12) |
| MUI v7 + Emotion 11 | ⚠️ Official TanStack example exists but pins **MUI v6.4.7**; it uses Emotion default insertion (no `CacheProvider`), which is the streaming-safe approach; no v7 breakage reports found, no v7 example either | examples/react/start-material-ui (fetched 2026-06-12); emotion.sh/docs/ssr |
| RTL: custom Emotion cache + `stylis-plugin-rtl` | ❓ **Undocumented** — zero coverage anywhere of custom Emotion cache + Start streaming SSR. Mitigation: RTL is toggled in the authed settings drawer; authed surface remains client-only (`ssr: false`), so the RTL cache never streams. Needs PoC confirmation (Phase 0a) | searched 2026-06-12, nothing found |
| nuqs 2.4.3 | ❌ for Start — TanStack Router adapter (nuqs 2.5+) is experimental and "does not yet cover TanStack Start" (maintainer); maintainer recommends native Router search-param APIs anyway | nuqs.dev/docs/adapters; nuqs 2.5 blog (2025-08-22) |
| remix-i18next 7 | ❌ — Remix/RR-specific; no Start equivalent package exists; community patterns use server middleware (cookie detection) + loader-based message loading | searched 2026-06-12 |
| remix-utils 8 (`ClientOnly`) | ❌ dependency, ✅ capability — `ClientOnly` ships natively in @tanstack/react-router | router docs (2026-06-12) |
| zustand 4 | ✅ — standard SSR rules apply (per-request stores, hydration flags); low risk with client-only authed surface | community guides (2025–2026) |
| framer-motion 12 | ✅ on Node runtime (one known issue was Bun-only) | issue #2904 (Dec 2024) |
| react-hook-form 7 + zod | ✅ — client-side only in our architecture; no Start issues found | searched 2026-06-12 |
| i18next 24 (core) | ✅ — the library works; only the Remix integration layer is lost | — |
| Kiota client (`@org/client-ts`) | ✅ — fetch-based, framework-agnostic; untouched | repo inspection |

---

## E. Gaps & Risk Register

| # | Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|---|
| R1 | Start still RC; near-daily patches; breaking change before GA | Medium | Medium | Gate G1 (wait for GA); pin exact versions; lockstep upgrade policy |
| R2 | File-based routing forces full route-tree restructure (~73 routes, 216 files) + invalidates route-organization conventions in guides (`frontend-architecture.md`, `frontend-route-file-organization.md`, `error-views.md`; NB: AGENTS.md also references `frontend-route-query-preloading.md`, which does not exist in the repo today — create it or fix the reference during Phase 3) | High (effort) | Certain | Phase 1 pre-reshapes the tree under RR7 so the flip diff is mechanical; guides rewritten in Phase 3 |
| R3 | RTL Emotion cache + streaming SSR undocumented; MUI v7 unverified with Start | High (if hit) | Low–Medium | Phase 0a PoC with hard exit criteria; structural mitigation: RTL only exists in the client-only authed surface |
| R4 | i18n server glue (locale cookie + per-route namespaces) must be hand-rolled; subtle hydration/locale-flash bugs possible | Medium | Medium | Phase 0b PoC; port the existing `entry.server.tsx` semantics 1:1; smoke matrix covers locale flip |
| R5 | nuqs rewrite (~18 files) introduces behavior drift in list filters/pagination | Medium | Medium | Phase 1b façade isolates URL-state call sites first; per-page acceptance checks in Phase 2 |
| R6 | Atomic cutover PR (no coexistence possible) — large blast radius at flip | High | Certain | Phases 0–1 shrink the flip to mechanical conversions; full smoke matrix + instant rollback (previous Docker image) in Phase 3 |
| R7 | 401/403 logout semantics regress during query-integration rework (do-not-regress invariant) | High | Low | Invariant called out as explicit acceptance criteria in Phases 2 and 3; existing centralized handling is framework-agnostic |
| R8 | Supply-chain exposure of fast-moving `@tanstack/*` deps | Medium | Low | Pin exact versions; renovate-style delayed upgrades; incident response precedent was strong |
| R9 | Solo-dev capacity: migration competes with product work for weekends | Medium | High | Plan is sliced into weekend-sized PRs; Phase 1 items are no-regret and independently valuable |

---

## F. Migration Shape Constraint

Running React Router v7 framework mode and TanStack Start **in the same app simultaneously is
not realistically possible** (both want to own the Vite build, the route tree, SSR, and the
document shell; community migration writeups consistently report being forced into a bigger-bang
cutover). Three strategies were considered:

1. **Prep-then-flip** ← chosen. Small no-regret PRs on `develop` decouple the app from RR-specific
   APIs while RR7 keeps shipping; one short-lived branch performs the atomic flip. The prep work
   reduces router lock-in even if the migration never executes.
2. **Big-bang branch** — rejected: a multi-week branch against an active `develop` is merge pain
   with no offsetting benefit.
3. **Parallel app strangler** (`apps/front-start` behind Traefik) — rejected: doubles infra,
   duplicates shell/theme/i18n for months; unjustifiable for a solo-maintained app.

---

## G. Effort Estimate (prep-then-flip, solo dev, weekend-sized slices)

| Phase | Content | Estimate |
|---|---|---|
| 0 | 3 de-risking PoCs | 2–3 weekend days |
| 1 | 5–8 no-regret decoupling PRs on develop | 2–4 weekends |
| 2 | Atomic flip branch | 3–5 weekends |
| 3 | Hardening, docs, deploy validation | 1–2 weekends |
| **Total** | | **~8–14 weekend days elapsed over 2–3 months** |

---

## H. Verdict: NOT-YET (conditional GO)

**No hard technical blocker exists.** Every load-bearing capability of the current frontend —
custom Express server with helmet CSP nonce, streaming SSR with bot handling, prerendering,
client-only authed surface, httpOnly session-cookie reading, TanStack Query integration — has an
officially supported, source-verified path in TanStack Start. Both stated motivations are
genuinely served.

**But executing now is imprudent:**

1. Start is **RC, not GA**, with near-daily patches — on a production app with no forcing event,
   GA is a cheap thing to wait for.
2. Three compatibility points are **unverified in the wild** (MUI v7, RTL Emotion cache with
   streaming, react-query-kit composition) — each needs a PoC, not faith.
3. The flip is **atomic** on a ~73-route production app; the prep phases that shrink it are
   valuable but the final step still demands a focused block of capacity.
4. The payoff is real but **not burning** — RR 7.14 is stable and maintained; nothing is broken
   today.

### Gates (all must pass to flip to GO)

- **G1 — GA:** TanStack Start 1.0 stable announced.
- **G2 — PoCs:** Phase 0 sub-spikes (0a RTL/MUI v7 streaming SSR, 0b i18n glue, 0c Express+nonce
  handler) pass their exit criteria.
- **G3 — Scope acceptance:** explicit sign-off on the nuqs → `validateSearch` rewrite and the
  file-based restructure (including the guide rewrites it forces).

### Early re-evaluation triggers (any of)

- nuqs ships a TanStack Start adapter
- Official "React Router v7 → TanStack Start" migration guide lands
- MUI publishes official Start SSR integration docs
- React Router v7 framework-mode direction degrades (e.g. forced RSC churn)

**Scheduled re-evaluation: ~Q4 2026.**

**Meanwhile:** Phase 1 of the plan (no-regret decoupling) may be executed at leisure — every item
reduces router lock-in and improves the codebase regardless of the final decision.

---

## References

- TanStack Start docs (hosting, selective SSR, prerendering, server functions, SPA mode): <https://tanstack.com/start/latest> (fetched 2026-06-12)
- v1 RC announcement: <https://tanstack.com/blog/announcing-tanstack-start-v1> (2025-09-23)
- Custom Express example: <https://github.com/TanStack/router/blob/main/e2e/react-start/custom-basepath/express-server.ts>
- CSP e2e suite: <https://github.com/TanStack/router/tree/main/e2e/react-start/csp>
- Code-based routing unsupported: <https://github.com/TanStack/router/issues/5808>
- Query integration: <https://tanstack.com/router/latest/docs/integrations/query>
- RR7 router-level migration guide: <https://tanstack.com/router/latest/docs/how-to/migrate-from-react-router>
- nuqs adapters (Start exclusion): <https://nuqs.dev/docs/adapters>; nuqs 2.5 blog (2025-08-22): <https://nuqs.dev/blog/nuqs-2.5>
- MUI example: <https://github.com/TanStack/router/tree/main/examples/react/start-material-ui>
- Emotion SSR + streaming: <https://emotion.sh/docs/ssr>
- Supply-chain postmortem: <https://tanstack.com/blog/npm-supply-chain-compromise-postmortem> (2026-05-11 incident)
- Lovable production adoption: <https://lovable.dev/blog/building-apps-using-tanstack-start>
- Security-headers middleware discussion: <https://github.com/TanStack/router/discussions/3028>
