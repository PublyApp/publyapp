Status: Historical — not normative
Original location: docs/superpowers/specs/2026-06-19-front-2-tanstack-heroui-migration-design.md
Archive reason: Completed design retained only for architectural decision history.
Superseded by: Current apps/front-2 implementation and docs/guides/front-2/conventions.md.

# Front-2 Migration Strategy & Architecture — TanStack Start + HeroUI v3

> Historical note: `apps/front-2-spike` was removed in #965 after its findings
> were reimplemented in `apps/front-2`. Spike paths below describe the approved
> migration strategy at the time.

| | |
|---|---|
| **Date** | 2026-06-19 |
| **Status** | Design approved — pending implementation plan(s) |
| **Type** | Strategy / architecture spec (parent; spawns downstream specs) |
| **Owner** | Radan |
| **Second opinion** | Codex (GPT-5.5, xhigh) — critique folded in (see §13, §16) |

---

## 1. Goal

Migrate the PublyApp frontend off **React Router v7 + MUI v7 (Emotion/`sx`)** onto
**TanStack Start + HeroUI v3 (Tailwind v4 + React Aria)**, by standing up a parallel
**`apps/front-2`** built to feature parity, then retiring `apps/front` via a staged proxy cutover.

This is the **parent strategy spec**. The hard sub-systems (Phase-0 spike, design/token wiring,
the table system, each rebuild phase) each get their own `docs/superpowers/specs/*` + plan.

## 2. North stars & success criteria

In priority-tie order, the migration optimizes for **all** of:

1. **Design freedom & brand** — own the look on Tailwind/HeroUI (deferred; see §8, §15).
2. **End-to-end type-safety & DX** — typed routing + typed search params, fewer abstractions.
3. **Performance & bundle** — compile-time Tailwind instead of Emotion runtime CSS.
4. **Strategic future-proofing** — off MUI+Emotion+RR before they age out.
5. **Exemplary code quality + tests** — SOLID/DRY/idiomatic React, react-doctor **100/100**,
   and a **real test suite** (Vitest + RTL unit, Playwright e2e) — which `front` lacks entirely today.

**Definition of done:** `front-2` passes the shared characterization/e2e suite (§11) on every surface,
meets per-surface bundle budgets, holds react-doctor 100/100, and the production cutover (§12) completes
with `apps/front` deleted and `front-2` renamed to `front`.

## 3. Decisions (the forks)

| Fork | Decision | Why |
|---|---|---|
| **i18n** | **Port i18next + keep InterZod** | Runtime key resolution is the right tool for backend-driven `translationKey`s; preserves the `no-manual-response-message-translation` contract; avoids a rewrite during a stack swap. Paraglide rejected as the wrong simultaneous rewrite. |
| **Forms** | **Keep RHF + Zod; re-skin only `Field.*`** | Form logic isn't the bottleneck — rendering + validation-message integration are. Rebuild ~20 wrappers on HeroUI/React Aria; all form state machines + Zod/InterZod carry over. |
| **Cutover** | **Staged-at-end + continuous staging deploy** | Build to parity, but deploy `front-2` to a staging proxy from Phase 1 so integration breaks surface weekly; flip **production** surface-by-surface at the end with per-surface rollback. (Codex argued full strangler; this is the reconciliation — see §12.) |
| **Phase 0** | **Full de-risking spike, gated** | Deployed, Playwright-tested production-runtime contract before committing the stack (see §10). |
| **Theming** | **Default-first** | Adopt HeroUI v3 stock appearance as-is; bespoke visual customization is an explicit later phase, decoupled from parity (see §8, §15). |
| **Server functions** | **Frontend-server concerns only — never an app-data BFF** | Kiota/.NET stays the single source of truth (see §4.1). |
| **Routing** | **Virtual File Routes** (code-based tree, file-backed components) | Direct analog of `front`'s explicit `routes.ts` + `_tree/*.routes.ts` tree; preserves surface-grouped layouts and explicit nesting instead of file-system-convention routing. See §7. |
| **Guides/doctrine** | **Stack-scoped under `docs/guides/front-2/`** | Legacy frontend guides stay true for `front` until cutover; front-2 guides are harvested from the reference pages; AGENTS.md gets a routing preamble; promote to canonical at cutover. See §16. |
| **Utilities** | **es-toolkit** (replaces lodash) | ESM-native → eliminates Vite's dep-optimize full-reload by design (the deep `lodash/*` CJS lazy-discovery problem); smaller + faster + TS-native; `es-toolkit/compat` for the long tail. Retires `prefer-specific-lodash-imports` in favor of named es-toolkit imports. |
| **Shared client code** | **Folded into `@org/shared-ts`** — no `front-core` package | ClientManager core, react-query factories, ApiFailure mapping, `query-utils`, i18n helpers go into `shared-ts` as new subpaths (`api-client/*`, `react-query/*`, `lib/api-failure`). `react` / `@tanstack/react-query` / `react-query-kit` / kiota / `client-ts` declared as **peerDependencies** so `shared-ts` stays isomorphic for its node-side consumers. Thin + post-spike. See §6. |

## 4. Guiding invariants (non-negotiable)

1. **Kiota/.NET is the single source of truth for all application data & mutations.**
   TanStack Start `createServerFn` is used **only** for frontend-server concerns: session-cookie
   read/write, SSR Query-cache priming, locale detection, CSP nonce. **No shadow BFF** that duplicates
   auth/error semantics. Enforced by a new lint rule (`no-server-fn-for-app-data`).
   *Consequence:* Start's lack of a native `<Form>`/action model is a non-issue — authed pages already
   mutate via TanStack Query against Kiota; only auth pages + `clear-session` use RR actions today, and
   those become thin cookie-setting server functions or client mutations.
2. **Parity is an executable contract** — a Playwright suite authored against the current app (§11);
   both apps run the identical suite.
3. **Per-request isolation on the server** — fresh Kiota client **and** fresh `QueryClient` per request;
   no staff/tenant token bleed across SSR requests; **zero token logging** (preserve existing rule).
4. **Error semantics preserved exactly** — RFC 7807 mapping, `401 = logout`, `403 = no-logout`,
   each with its own test.
5. **Accessibility is protected API** — React Aria data-attributes / focus rings can't be styled away;
   guarded by a lint rule + axe/keyboard regression tests.

## 5. Current-state blast radius

- **~32–40 routes / ~30–35 page components**, 3 surfaces: marketing (SSR loaders), auth (SSR loaders),
  authed (client-only TanStack Query; staff + tenant). ~182 route `.tsx` files; ~651 `src` files.
- **MUI coupling is the big one:** ~**1,662** files import `@mui/*`; ~**4,097** `sx`/styled usages;
  20 `Field.*` wrappers; MRT + `@mui/x-data-grid` tables; Emotion cache + stylis RTL.
- **Router coupling:** `useLoaderData`/`Link`/`useNavigate`/`meta`/`ErrorBoundary`/`loader`/`action`,
  `getServerLoader`/`getServerAction` wrappers, nuqs adapter.
- **i18n:** i18next + remix-i18next + InterZod (Zod errors via i18next; route-namespace detection).
- **No frontend tests today.**

Anchor files: `src/routes.ts`, `server.js`, `server/app.ts`, `src/root.tsx`, `src/entry.{server,client}.tsx`,
`src/lib/api-client/client-manager.ts`, `src/lib/react-query/create-hooks.ts`,
`src/lib/react-router/server-data.server.ts`, `src/lib/mui/theme/*`, `src/components/hook-form/*`,
`src/lib/i18n/*`, `packages/lint-ts/src/rules/*`.

## 6. Target architecture & monorepo shape

```
apps/
  front/          # current — stays live & buildable until staged cutover
  front-2/        # new — TanStack Start + HeroUI v3 + Tailwind v4
packages/
  client-ts/      # Kiota client — REUSED unchanged
  shared-ts/      # REUSED — and ABSORBS the portable client-core (no new package),
                  # added as new subpaths AFTER the spike proves the runtime shape:
                  #   • existing: validations, constants, InterZod, i18n helpers (isomorphic)
                  #   • api-client/*    — Kiota ClientManager core (cookie-reader injected as a seam)
                  #   • react-query/*   — factory contracts + query-key util
                  #   • lib/api-failure — session/header policy + ApiFailure mapping
                  #   • test fixtures
                  # react / @tanstack/react-query / react-query-kit / kiota / client-ts are
                  # peerDependencies → node-side consumers never load the React subpaths.
  lint-ts/        # retire MUI rules; add Tailwind/HeroUI + a11y-protected + no-BFF rules
```

`apps/front-2` in the same monorepo is the right isolation model. The client-core stays **thin and late**:
folded into `shared-ts` only once Start's loader + Query-SSR shape is proven, to avoid freezing a
lowest-common-denominator compatibility layer (Codex). Until then the portable code lives inside
`front-2`. `front` keeps its in-app copy untouched — no point refactoring a retiring app.

## 7. What's reused vs rebuilt

**Reused nearly verbatim** (confirmed by reading the anchors):
- `client-ts` (Kiota) — unchanged.
- `create-hooks.ts` — all six factory families (tenant/staff/auth/public × query/suspense/mutation)
  have **zero router coupling**; pure react-query-kit + Kiota.
- `ClientManager` — only framework seams are the cookie-reader (`getSessionTokensFromClient`) and `env`.
- `shared-ts` (validations, constants, InterZod, i18n helpers) — and it becomes the new home for the
  absorbed client-core (ClientManager core, react-query factories, ApiFailure mapping, `query-utils`,
  feature hooks) via new subpaths (§6).

**Rebuilt:**
- **Routing/SSR shell** — RR7 framework mode → TanStack Start, using **Virtual File Routes**
  ([docs](https://tanstack.com/router/latest/docs/routing/virtual-file-routes)): the route tree is
  assembled programmatically in code (`rootRoute`/`route`/`layout`/`index`/`physical`) with each node
  pointing at a physical component file — the direct equivalent of `front`'s `routes.ts` composing
  `routes/_tree/*.routes.ts`. **Not** file-system-convention routing. Plus `__root.tsx`, loaders,
  `head`/`errorComponent`/`notFoundComponent`, typed `Link`/`navigate`.
- **Server data wrapper** — `getServerLoader`/`getServerAction` → Start loaders + server functions
  (cookie/token extraction, locale, auth redirect).
- **i18n SSR wiring** — remix-i18next → hand-wired i18next SSR (config + InterZod kept).
- **UI/component layer** — MUI+Emotion+`sx` → HeroUI v3 + Tailwind v4 (the ~1,662-file surface;
  mechanical-with-judgment, not architectural).

**URL state:** prefer Router's typed search-param APIs (`validateSearch`/`useSearch`) over nuqs;
keep the experimental nuqs/tanstack adapter only where a third-party component already needs it.

## 8. UI strategy — default-first HeroUI v3 + Tailwind v4

- **Theming = default-first.** Adopt HeroUI v3's stock theme. Phase-1 "token layer" is the **minimum**:
  wire the default theme, set brand primary + dark-mode toggle (`useTheme`). **No** bespoke Emotion→OKLCH
  token-mapping system upfront. Bespoke visual identity is a **later, decoupled phase** (§15).
- **Primitives are harvested from real pages, not speculated.** The 2–3 hostile reference pages
  (dense staff table, settings form, auth) drive the **functional** primitive set: `Field.*`, the table
  system, `<Image>`, app shell + nav.
- **App shell / nav** — HeroUI v3 **removed Navbar**; we build our own shell.
- **Tables (highest UI risk)** — HeroUI Table (presentational) + TanStack Table (logic). Gets its own
  mini-spec: density, column resize/pin, virtualization, keyboard, bulk-actions, measured against current
  MRT/`@mui/x-data-grid` ergonomics. **Retire** `material-react-table` + `@mui/x-data-grid`.
- **`<Image>` primitive** — rebuilt explicitly (ratio, lazy, blur, fallbacks, OG); not an afterthought.
- **Animation** — HeroUI v3 dropped Framer Motion (native CSS internally). Keep `framer-motion` for our
  own `varFade`/`hoverLift` presets where we want them; default to HeroUI's built-ins otherwise.
- **Lint** — retire MUI-specific rules (`no-native-html-in-mui-surfaces`, `no-raw-mui-textfield-register`,
  `no-raw-img-in-product-surfaces`); add Tailwind/HeroUI discipline rules, the React-Aria-protected-API
  rule, `no-server-fn-for-app-data`, and a named-es-toolkit-imports rule (replacing
  `prefer-specific-lodash-imports`; see §3 Utilities). Keep portable rules
  (`no-direct-dayjs-in-components`, `no-console-in-source`, `no-array-reduce`,
  `no-manual-response-message-translation`).

## 9. Data, auth, i18n, forms (the carry-over layer)

- **Data:** keep ClientManager + factory hooks; in Start, loaders prime the Query cache via
  `@tanstack/react-router-ssr-query` (`context.queryClient.ensureQueryData` → `useSuspenseQuery`).
  This is the cleanest part of the migration for a Query-heavy app.
- **Auth/session:** dual-token (staff/tenant) cookie model preserved; per-request Kiota client + per-scope
  Query cache to prevent token bleed (§4.3). SSR tests for tenant selection, expired sessions,
  401-logout, 403-no-logout, zero token logging.
- **i18n:** i18next + InterZod kept; SSR init hand-wired into Start; route-namespace strategy reproduced;
  cross-tab locale sync preserved.
- **Forms:** RHF + Zod kept; rebuild the `Field.*` rendering layer on HeroUI/React Aria; InterZod
  validation-message integration preserved and tested hard.

## 10. Phase plan (each phase has a hard exit gate)

- **Phase 0 — De-risking spike + parity harness (GO / NO-GO).**
  Disposable `front-2-spike`; **exact-pinned** deps + `--ignore-scripts` install policy **tested in CI**
  (supply-chain hygiene must be proven, not assumed). Hard slice: login → dual-token cookie session →
  authed shell → one **real** staff list (Kiota + TanStack Query + TanStack Table, dense) → one RHF/Zod
  **dialog** with one translated validation error → i18next SSR → dark mode. **Deployed as a Node/Docker
  container behind a Traefik-shaped proxy.** Playwright runs against the **deployed container**: no-JS SSR
  HTML, hydration-warning-as-failure, cookie isolation, 401/403 semantics, CSP report-only with
  Tailwind/HeroUI style injection + nonce/hash, axe checks, table keyboard flows. In parallel: author
  characterization tests against current `front` (§11). **Gates:** resolve the **HeroUI license**
  inconsistency (repo Apache-2.0 vs `package.json` MIT) and re-verify TanStack Start's runtime/1.0 status
  (§14). All green → commit to the stack; else reconsider.
- **Phase 1 — Foundations, harvested from the spike.** Thin client-core fold into `shared-ts`; default theme wiring
  (§8); i18n SSR; auth/session; app shell + nav; CSP/nonce; the **table system**; the `Field.*` re-skin.
  `front-2` begins **continuous deploy to staging**.
- **Phase 2 — One reference page per archetype** (list, detail, settings-tab, form/dialog, marketing,
  auth), hand-built + fully tested. These become **route-archetype generators/templates** — executable,
  not prose. Each generator emits both the **Virtual File Routes** tree entry and the backing component
  file for the archetype, so fan-out adds routes the same way `front` does today.
- **Phase 3 — Agent fan-out** of the remaining ~30 pages against the generators + the green characterization
  suite. Agents build to a passing suite, not a vibe (realizes the hybrid execution model).
- **Phase 4 — Staged production cutover** (§12).

## 11. Parity-as-executable-contract

Because `front` has **no tests**, the first build work is **characterization Playwright tests against the
current app**, capturing the invariants the new app must preserve:

- auth redirects; `401`-logout vs `403`-no-logout; zero token logging;
- URL search-param state (filters/pagination/sort); query invalidation semantics;
- i18n validation errors (InterZod) and server `translationKey` resolution;
- no-JS SSR HTML for marketing/auth; status codes, redirects, canonical/OG/sitemap/robots/locale meta;
- accessibility (axe + keyboard) for dialogs, menus, comboboxes, toasts, tables, focus restore.

Plus **shared contract tests** (auth, ApiFailure mapping, i18n validation, search params, invalidation)
that both apps import. This suite is the gate for every fan-out page and the seed of `front-2`'s e2e suite.

## 12. Cutover plan

- **Build:** `front-2` to full parity; **continuous staging deploy** behind a proxy from Phase 1 so
  integration failures surface weekly (Codex's core concern, absorbed without two **production** apps).
- **Flip:** production cutover **surface-by-surface** at the proxy — **marketing → auth → authed** —
  each with **per-surface rollback**. Marketing first (lowest risk, SEO upside), authed last.
- **Finish:** once all surfaces are flipped and stable, delete `apps/front` and rename `front-2` → `front`
  (+ retire the staging duplication).
- **Alternative on the table:** full strangler-in-prod (live traffic on migrated surfaces early) — more
  early signal, at the cost of dual **production** maintenance. Not chosen, but the staged-at-end design
  keeps it reachable if priorities change.

## 13. Risk register

| Risk | Sev | Surfaced / mitigated by |
|---|---|---|
| HeroUI v3 SSR on Vite (no official non-Next guide) | High | Phase-0 deployed spike |
| TanStack Start RC churn (Nitro→Vite runtime in flux) | High | Pin everything; Phase-0; re-verify §14 |
| Table parity vs MRT/MUI-X (density/resize/pin/virtualization/keyboard) | High | Dedicated table mini-spec + spike page |
| Server-fn "shadow BFF" temptation | High | Invariant §4.1 + `no-server-fn-for-app-data` lint |
| Agent drift (silent change to URL/auth/i18n/a11y) | High | Characterization suite + generators (§11, §10) |
| Supply-chain (May 2026 `@tanstack` npm compromise) | Med | Pinned + lockfile + `--ignore-scripts`, **CI-enforced + cache-tested** |
| HeroUI license (Apache vs MIT) | Med | **Phase-0 gate** before any token work |
| Token bleed across SSR requests | Med | Per-request client + per-scope Query cache + tests (§4.3) |
| RTL: Tailwind physical utilities ≠ Emotion stylis | Med | Audit; test popovers/icons/table/TipTap/mixed-direction |
| CSP with Tailwind/HeroUI style injection + nonce | Med | Prove in Phase-0, not after |
| React Aria ≠ automatic a11y once restyled | Med | Protected-API lint + axe/keyboard tests |
| Per-surface bundle regressions (dual runtime during strangle) | Low | Per-surface budgets; measure TipTap/Kiota/HeroUI granularity |
| OKLCH edge cases (old WebViews/screenshots/contrast) | Low | Lower priority under default-first theming |

## 14. Technology facts (as of 2026-06-19 — re-verify at commit time)

- **HeroUI v3:** GA since 2026-03-22 (v3.2.1, 2026-06-17). Tailwind v4, React Aria Components,
  CSS-variable/OKLCH tokens, compound components, **dropped Framer Motion**. Complete rewrite from v2,
  **no codemod**. Gaps: no true data-grid, **Navbar removed**, no charts/rich-text/tree-view.
  **License inconsistency unresolved.** Vite/non-Next SSR not officially documented.
- **TanStack Start:** **RC, not confirmed 1.0** (live site says RC). Nitro-for-build, Vite-for-dev/runtime
  (in flux). `createServerFn`. First-party Query SSR integration. **No native form-action model.**
  i18n is DIY. Standalone Node/Docker deploy supported (Dokploy-compatible). **May 2026 npm supply-chain
  compromise** across `@tanstack` packages → strict pinning/lockfile/`--ignore-scripts`.
- **Re-verify before commit:** (a) whether a formal **1.0.0** shipped; (b) the **final runtime server
  story** at the adopted version; (c) HeroUI **license** resolution.

## 15. Out of scope / deferred

- **Bespoke visual identity / brand theming.** `front-2` ships on HeroUI v3 defaults. Custom palette,
  typography, radii, motion, and marketing-surface polish land in a **separate later phase**. Marketing
  (landing/pricing) is the natural **first** item there, since stock defaults feel least branded on the
  public surface.
- **TipTap, dayjs/format-time, Zustand, PostHog analytics** — carried over; not re-evaluated here.

## 16. Guides & rules governance (doctrine migration)

The frontend doctrine in `docs/guides/` is part of the migration scope. Of 25 guides, **13 backend/tooling
guides + `project-conventions.md` are untouched**; the frontend cluster moves.

**Model — stack-scoped guides:**
- **Legacy frontend guides stay authoritative for `apps/front`** until cutover — no edits that would make
  them false for the still-live app.
- **`front-2` guides live under `docs/guides/front-2/`**, harvested from the Phase-2 reference pages —
  authored *inside the downstream spec that builds that surface*, not litigated upfront.
- **AGENTS.md gains a routing preamble** when `front-2` is scaffolded (Phase 0/1): "Working in
  `apps/front-2`? follow `docs/guides/front-2/*`; the frontend guides below describe `apps/front` (legacy)
  until cutover." Backend guides remain shared/canonical.
- **At cutover (Phase-4 runbook):** delete legacy frontend guides + `tailwind-to-sx-mapping.md`, move
  `docs/guides/front-2/*` up to `docs/guides/`, rewrite AGENTS.md frontend sections + fix references, drop
  the preamble.

**Per-guide ownership (which downstream spec writes the front-2 guide):**

| Legacy guide | Disposition | Authored by |
|---|---|---|
| `frontend-architecture.md` | rewrite (Start) | routing/SSR + shared-ts client-core specs |
| `frontend-route-file-organization.md` | rewrite (Virtual File Routes) | routing/SSR spec |
| `frontend-coding-standards.md` | rewrite (HeroUI/Tailwind) | design-system + `Field.*` specs |
| `error-views.md` | rewrite (HeroUI shell) | app-shell/error spec |
| `marketing-surface-conventions.md` | rewrite (Tailwind) | visual-customization phase (later) |
| `list-pages-…-cursor-pagination.md` | adapt | table-system spec |
| `bulk-action-ux-conventions.md` | adapt | table-system spec |
| `frontend-error-handling.md` | adapt (TanStack wiring) | shared-ts client-core spec |
| `ai-agent-preferences.md` (FE section) | adapt | Phase 2 (as conventions solidify) |
| `lint-rules.md` | update incrementally | Phase 1+ (retire MUI rules; add HeroUI/Tailwind/a11y) |
| `common-workflows.md` (FE section) | update | Phase 2 |
| `tailwind-to-sx-mapping.md` | **delete at cutover** | — (kept for `front`'s AIDesigner→sx flow until then) |

**Notable inversions** the front-2 guides will encode: `sx`-only / never-`className` → **Tailwind-utility-first**;
`no-native-html-in-mui-surfaces` → `no-native-html-in-heroui-surfaces`; `theme.applyStyles` → Tailwind dark
mode; loaders/actions → Start loaders + server-functions-for-frontend-concerns-only; MUI lint rules retired,
Tailwind/HeroUI + a11y-protected + `no-server-fn-for-app-data` rules added; `prefer-specific-lodash-imports`
(deep `lodash/*` CJS imports) retired → named imports from **es-toolkit** (§3 Utilities).

## 17. Decomposition — downstream specs

This parent spawns (each its own `docs/superpowers/specs/*` + `plans/*`):
1. **Phase-0 spike** spec (deployed runtime contract + characterization harness).
2. **Table system** spec (HeroUI Table + TanStack Table grid-parity).
3. **shared-ts client-core fold** spec (thin, post-spike; new subpaths + peer deps).
4. **i18n SSR wiring** spec.
5. **`Field.*` re-skin** spec.
6. **Route-archetype generators** spec (templates for fan-out).
7. **Staged cutover** runbook.
8. (Later) **Visual customization** spec.
9. **Guide migration & AGENTS.md routing preamble** (per §16).

## 18. Open questions to resolve in Phase 0

- TanStack Start 1.0 status + runtime server model at adoption version.
- HeroUI license resolution (blocking gate).
- HeroUI v3 SSR on Vite behavior (CSS vars, hydration, portals, React Aria overlays).
- Table grid-parity feasibility on HeroUI Table + TanStack Table vs current MRT/MUI-X ergonomics.
- CSP/nonce compatibility with Tailwind/HeroUI style injection.
