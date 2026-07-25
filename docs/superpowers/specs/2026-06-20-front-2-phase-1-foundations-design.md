# Front-2 Phase 1 — Foundations Design

**Status:** Approved design (brainstorm output), **Rev 3** — reconciled against two rounds of
adversarial senior-engineer review (GPT-5.5 xhigh, 2026-06-20). Source-of-truth for the Phase 1
implementation plan. Scoped to **Phase 1 only** — the durable-foundations layer of the front-2
migration, NOT the full migration.

**Goal:** Stand up a durable `apps/front-2` carrying the proven foundation layer, deployed
continuously to staging, so Phase 2 can hand-build reference pages on solid ground — with the
foundation decisions (error views, URL state, query/client core, observability) made **now**,
not discovered while porting pages.

**Parent strategy spec:** `docs/superpowers/specs/2026-06-19-front-2-tanstack-heroui-migration-design.md`
(this is the Phase 1 row of §10). **Phase 0 outcome:** GO — see
`docs/superpowers/reviews/2026-06-19-front-2-phase-0-findings.md`.

**Rev 2 changelog:** expanded shared-ts fold; added staging runbook; added AppErrorView with the
correct 401 split; made a browser-confirmed current-app baseline a hard M0 gate; reworded the 401
back-port to evidence-driven; decided the punted foundations (URL state, analytics, Zustand,
`<Image>`, SEO/meta, a11y); reduced lint scope.

**Rev 3 changelog (round-2 reconciliation — executability):** the round-1 fixes held, but round 2
caught that the shared-ts fold over-corrected — the query/client core is **app-bound** (not just
router-free): `client-manager.ts` imports app `env`+cookies, `create-hooks.ts` imports the app
manager, `QueryDisplay` is MUI-bound, and `shared-ts` has no React/Query/Kiota deps. Rev 3
rewrites the fold as **ports-and-adapters with injected seams** (§5.3): only pure, dependency-light
contracts go to `shared-ts`; app-bound pieces stay app-local. Also: staging made concrete (named
services/env/workflow/migration-runner/smoke/rollback) and authored as an **M0** artifact;
**per-milestone exit gates** replace the contradictory blanket "deployed-smoke" DoD; lint
path-scoping given mechanics + config tests; front-2 guide creation made a deliverable; fixed the
D2 §-reference.

---

## 1. Context

Phase 0 shipped a disposable de-risking spike (`apps/front-2-spike`, now on `develop`) and
returned **GO**. It also caught a real 401-logout bug **in the spike** and produced a parity
contract. **Important caveat the plan must respect:** Phase 0 never browser-confirmed the
**current** app — `apps/front`'s dev server exited on first `GET /login` in-sandbox, so parity
was verified by API + source inspection only (`docs/front-2-migration/parity-contract.md`). The
current-app parity baseline is therefore **unproven in a browser**, which directly shapes the
characterization sequencing (D1).

Phase 1 turns the proof into durable infrastructure. It is **foundations, not pages**.

## 2. Anchor decisions

| # | Decision | Rationale |
| --- | --- | --- |
| D1 | **Characterization runs parallel, but a browser-confirmed current-app baseline is a hard M0 exit gate** | The full suite (#693/#694) is the Phase-2 fan-out gate and runs alongside foundations. BUT because Phase 0 never booted the current app in a browser, M0 must first prove `apps/front` boots and capture an auth / 401-split / URL-state / table smoke baseline — otherwise Phase 2 inherits an unknown parity target. (Review weakened the naive "fully parallel" framing; this is the reconciliation.) |
| D2 | **Fresh `apps/front-2`, deliberate harvest** | The spike was disposable; its value is the proven recipe, not its probe-era code. A fresh app sets durable conventions cleanly. The harvest map (§5.2) lists what graduates; the **implementation plan makes it file-path-specific**. Spike kept as read-only reference until front-2 matches coverage, then deleted. |
| D3 | **Staging design authored in M0; staging stands up at M1.5** | Continuous staging needs something integrated to deploy, so standup is M1.5 — but the infra gap is real (no staging in `dokploy.yml`; single-origin CORS; source-upload deploy script), so the **concrete staging design artifact (§7) is authored in M0** (named services/env/workflow/migration-runner/smoke/rollback), before any shell work, so M1.5 is execution not discovery. |
| D4 | **Ports-and-adapters shared fold; back-port to `apps/front` only on proven need** | Only **pure, dependency-light** code goes to `shared-ts` (api-failure types+mapping, session token parsing, redaction, query-key/query-state contracts). The **app-bound** pieces stay app-local behind injected seams: `ClientManager` (app env+cookies), the concrete `ApiClient`, cookie reader, logout/toast/tenant handlers, and the `QueryDisplay` renderer (HeroUI in front-2, MUI in front). The hook-factory generic is shared but takes an **injected client accessor** (not the app's `getClientManager`). See §5.3. **401 back-port:** `apps/front` already maps `problemDetails.status ?? responseStatusCode ?? 500` and has 401-only Query logout — **no bug present; the spike bug was spike-local.** M0.3 confirms; back-port only if disproven. |

## 3. Foundation decisions previously punted — now decided

These were flagged by review as "decide now or rediscover in Phase 2":

- **D5 — URL state: adopt TanStack Router typed search params** for front-2 (per strategy §, over `nuqs`). The current app is `nuqs`/MRT-based (`apps/front/src/hooks/use-table-state.ts`); front-2 builds a typed-search-param table-state adapter. **Decided before M2.1** (the table depends on it).
- **D6 — Error views are a Phase-1 foundation.** Port the retired app's `AppErrorView` system to
  HeroUI with the **correct 401 split**: auth-surface 401 → **NO logout** (expired URL-borne
  tokens; show view + back-to-login); authed 401 → **logout**; 403 → **no logout** anywhere.
  Built in M1, tested.
- **D7 — `QueryDisplay` equivalent** ships with the query core fold (front-2's standard query-state renderer), since every authed surface depends on it.
- **D8 — Observability/state carry:** **carry** analytics (`shared-ts/lib/analytics` PostHog wrapper + SSR bad-response capture, mirroring `apps/front/src/entry.server.tsx`); **carry minimal** Zustand global UI state (theme + sidebar/settings, as the authed layout initializes today). Decided in M1.
- **D9 — `<Image>` primitive: demand-driven, not deferred-as-afterthought.** Built when the first M2 reference surface needs content imagery (strategy treats it as first-class); not pre-built in M0/M1.
- **D10 — SEO/meta baseline** (canonical/OG/sitemap/robots/locale meta) for the marketing/auth SSR surfaces is part of M1's SSR wiring, not a Phase-2 surprise.
- **D11 — Accessibility gates** (axe + keyboard) are wired into the front-2 e2e harness from M1 and applied to every primitive (shell, error views, table, `Field.*`).
- **D12 — Lint scope reduced.** In Phase 1: **retire** the MUI rules for `apps/front-2/**` via path-scoping only (root `.oxlintrc.json` is global; the local JS plugin is alpha). **Defer** authoring NEW custom rules (`no-server-fn-for-app-data`, React-Aria-protected-API) until after the shell — track them as advisory conventions in the front-2 guide until they have rule tests.

## 4. Scope

**In scope:** fresh `apps/front-2` scaffold · app shell + nav · auth/session · **error-view system
(D6)** · i18n SSR · CSP/nonce · **SEO/meta baseline (D10)** · default theme + dark-mode · the
table system · the `Field.*` re-skin · **thin-but-complete shared-ts fold incl. query/client core
+ QueryDisplay (D4/D7)** · **URL-state adapter (D5)** · **analytics + minimal Zustand carry (D8)**
· **a11y gates (D11)** · continuous staging deploy (against §7 runbook) · parallel characterization
harness (#693/#694) with a browser baseline gating M0.

**Out of scope (deferred):** real product pages beyond what exercises the foundations → Phase 2;
bespoke brand theming / OKLCH tokens → later phase (strategy §15); production cutover → Phase 4;
deleting `apps/front-2-spike`; authoring new custom lint rules (D12). `<Image>` is built on first
M2 demand (D9), not pre-built.

**Definition of done:** `apps/front-2` deploys to hosted staging on every merge; auth / error
views / i18n / CSP / SEO meta / shell / theme / table / `Field.*` work there with invariants
preserved (**auth-401 no-logout, authed-401 logout, 403 no-logout, zero token logging, typed-URL
search-param state, InterZod errors**); the characterization suite is green with a proven browser
baseline and wired as the Phase-2 fan-out gate.

## 5. Architecture

### 5.1 Durable app structure (TanStack Start idioms)

```
apps/front-2/src/
  router.tsx          # getRouter() + setupRouterSsrQueryIntegration; ssr.nonce per request
  server.ts           # custom server entry — CSP headers on every status (incl. 404)
  routes.ts           # Virtual File Routes tree
  routes/             # marketing/auth = SSR; authed = ssr:false / CSR
  components/          # HeroUI primitives: app shell, error views, Field.*, table, QueryDisplay
  layouts/            # marketing / auth / authed (each with its error boundary)
  lib/                # app-local: kiota client wiring, i18n wiring, url-state adapter,
                      #   analytics, zustand store, server fns (cookie-I/O only)
  styles/ · types/ · server.mjs (srvx standalone entry)
```

### 5.2 Harvest map (spike → front-2), cleaned on the way in

Carried & hardened: auth/session + `beforeLoad` guard · i18n SSR (InterZod global map) · CSP/nonce
(custom `server.ts`) · standalone `server.mjs`/srvx · VFR wiring · supply-chain policy (exact-pin,
`--ignore-scripts`, `assert-pinned`, frozen lockfile). Fixed during harvest: real
`@hookform/resolvers`; `noUnusedLocals` on; no probe routes; no "spike" naming; CI promoted to a
real `apps/front-2` workflow.

### 5.3 shared fold — ports-and-adapters (corrected in Rev 3)

`shared-ts/lib` already carries `csp`, `i18n`, `constants`, `zod`, `analytics`, `logger`.
**Caveat round 2 verified:** the current query/client core is *router-free but app-bound* —
`apps/front/src/lib/api-client/client-manager.ts` imports app `env` + cookie utils,
`create-hooks.ts` imports the app `getClientManager`, and `query-display.tsx` imports
`@mui/material`. Lifting them into `shared-ts` would drag app coupling + new React/Query/Kiota
deps into a currently-light package. So the fold is **ports-and-adapters**, not lift-and-shift:

**Goes to `shared-ts` (pure, dependency-light — type-only Query imports at most):**
- `lib/api-failure` — `ApiFailure` union + `toApiFailure` mapping (no React/MUI)
- `lib/session` — token parse/select over a cookie *string* (pure functions; no cookie I/O, no env)
- redaction helpers (pure)
- **query contracts:** the query-key builder (`query-utils`), the query-state predicate
  (`checkIfEmptyQueryData`), and a hook-factory generic that accepts an **injected client
  accessor** + key builder (not the app's `getClientManager`)

**Stays app-local in `apps/front-2` (implements the seams):**
- `ClientManager` / Kiota `ApiClient` wiring (front-2's own `env` + cookie reader)
- the `QueryDisplay` renderer (HeroUI), consuming the shared query-state contract
- logout / toast / tenant-resolution handlers injected into the shared mapping/factory

**Seam contract:** shared modules depend only on injected interfaces (`{ getClient, readCookie,
onLogout, onToast, resolveTenant }`), never on a concrete app module. **Peer-deps:** any shared
module that imports `@tanstack/react-query` / `react-query-kit` / Kiota at runtime adds them as
**peer** dependencies of `shared-ts`; prefer type-only imports to avoid peers where possible.

Each shared module is unit-tested in `shared-ts`. **No refactor of `apps/front`** onto these (it is
retiring) — back-port only a proven production bug fix as a standalone PR.

### 5.4 Error views (D6) — the corrected 401 semantics

Port `AppErrorView` to HeroUI. ErrorBoundary placement mirrors the retired app's error-view guide:
auth-surface boundary (**401 → no logout**, expired URL token → view + back-to-login), authed
boundary (**401 → logout**), 404/403 views (**403 never logs out**). This is a hard invariant set,
e2e-tested.

### 5.5 Lint (D12) — path-scoped retirement, with mechanics + tests

Scope MUI-rule retirement to `apps/front-2/**`; `apps/front` keeps MUI rules until cutover. Keep
portable rules (`no-direct-dayjs-in-components`, `no-console-in-source`, `no-array-reduce`,
`no-manual-response-message-translation`). New custom rules deferred (advisory in the front-2 guide).

**Mechanics (round-2 nit):** the root `.oxlintrc.json` is global, and the custom rules are
inconsistent — some hardcode the surface path (`no-native-html-in-mui-surfaces.js` targets
`apps/front/src`), others do not (`no-raw-mui-textfield-register.js`). So Phase 1 must: (a) confirm
the path-hardcoded rules already exclude `apps/front-2`; (b) add path-scoping (overrides block or
in-rule path guard) for the non-scoped MUI rules so they do not fire on `apps/front-2`; (c) add a
**config/rule test** asserting `apps/front` stays protected by the MUI rules AND `apps/front-2` is
not blocked by them. The local JS plugin is alpha — keep changes config-level where possible.

**Portable-rule coverage (round-3 nit):** the rules we want to *keep* are currently hardcoded to
`apps/front/src` too — `no-console-in-source.js` (`apps/front/src/` prefix check) and
`no-direct-dayjs-in-components.js` (`FRONT_SRC_PREFIX = 'apps/front/src/'`). So "keep the portable
rules" requires a plan task to **widen their path helpers to also cover `apps/front-2/src`** (with a
test), or to explicitly defer that coverage in `docs/guides/front-2/`. This is plan-level, not a
spec blocker.

## 6. Milestone breakdown

### M0 — Bootstrap, proven baseline & staging design (parallel kickoff)
- **M0.1 — Fresh scaffold.** `apps/front-2` (pinned, supply-chain policy, `assert-pinned`, real CI,
  `noUnusedLocals` on, no cruft). **Re-pin/re-verify TanStack Start** (phase-boundary gate).
- **M0.2 — Characterization track (#693/#694).** Land test infra (Vitest + MSW + Playwright) + the
  current-app design (#694). Runs alongside M1/M2.
- **M0.3 — Browser baseline + 401 verification (HARD M0 EXIT GATE).** Get `apps/front` to boot in a
  browser against seeded data; capture the smoke baseline (login redirect, **auth-401 vs authed-401
  vs 403 split**, typed-URL state, table render/search). Confirm `apps/front` has **no** 401 bug
  (expected) — back-port only if disproven. M1 does not start until this baseline is green.
- **M0.4 — Staging deploy design artifact (§7).** Author the concrete staging plan: exact service
  names, env vars, domains, GHCR workflow file path, migration/seed runner, smoke URL, rollback
  path. No deploy yet — this de-risks M1.5 so it is execution, not discovery.
- **M0.5 — front-2 guide scaffold.** Create `docs/guides/front-2/` (stack-scoped conventions incl.
  the deferred lint rules as advisory). Grows through M1/M2; promoted to canonical at cutover.

### M1 — Staging-capable shell (gates staging standup)
- **M1.1 — shared fold (§5.3, ports-and-adapters):** pure `shared-ts` modules (api-failure, session,
  redaction, query-key/query-state contracts, injected-client hook-factory generic), unit-tested;
  front-2 app-local adapters (ClientManager, HeroUI QueryDisplay, injected handlers).
- **M1.2 — App shell + nav + default theme + minimal Zustand (D8):** custom HeroUI shell, dark-mode
  toggle, brand primary; theme + sidebar state.
- **M1.3 — Auth/session + error views (D6):** dual-token cookie, `beforeLoad` guard, login flow;
  AppErrorView with the auth-vs-authed 401 split + 403-no-logout, e2e-tested.
- **M1.4 — i18n SSR + CSP/nonce + SEO/meta baseline (D10) + analytics carry (D8):** cookie-driven
  locale + InterZod; CSP+nonce on every status incl. 404; canonical/OG/robots/sitemap/locale meta;
  PostHog + SSR bad-response capture.
- **M1.5 — Staging standup (per §7 runbook):** front-2 GHCR image + staging service + dedicated
  staging API/DB; continuous deploy on merge; deployed smoke (graduated spike `e2e/smoke`) green.
  **Smoke scope = marketing/auth SSR + authed shell renders & guards** (NOT the full staff-users
  data grid — that is M2).

### M2 — Data & form systems
- **M2.0 — URL-state adapter (D5):** typed TanStack Router search params + table-state adapter
  (replaces nuqs/MRT pattern). Decided/built before the table.
- **M2.1 — Table system** (own mini-spec): HeroUI `Table` + `@tanstack/react-table` — cursor-pagination
  parity (current app paginates; no virtualized grid required), search/sort, bulk-selection
  scaffolding, density, keyboard a11y. Resize/pin/virtualization built only if a parity surface needs them.
- **M2.2 — `Field.*` re-skin:** RHF + Zod/InterZod over HeroUI inputs, mirroring the current
  `Form`/`Field.*` API for mechanical Phase-2/3 porting.
- **Exit:** staff-users beachhead runs production-grade on front-2 at staging; characterization suite
  green (with proven baseline) and wired as the Phase-2 fan-out gate.

## 7. Staging design (authored in M0.4; executed in M1.5)

The infra does not exist today (`dokploy.yml` has only prod `publyapp-api` + `publyapp-front`; CORS
is single-origin `WithOrigins(env.FRONT_URL)`; `scripts/deploy.mjs` is source-upload, not GHCR).
M0.4 produces this as a concrete, executable artifact; M1.5 wires it:

- **CI workflow:** `.github/workflows/front-2-staging-deploy.yml` — on merge to `develop` touching
  `apps/front-2/**`: build + push `ghcr.io/radandevist/publyapp/front-2:<sha>` (+ `:staging`), then
  trigger the Dokploy redeploy. (Mirror the existing api/front image conventions in `dokploy.yml`.)
- **Services/domains (dokploy delta):** add `publyapp-front-2-staging` + a **dedicated**
  `publyapp-api-staging` + **staging Postgres** (isolated), on staging domains
  (`front-2-staging.<domain>`, `api.front-2-staging.<domain>`).
- **Migration/seed runner:** a one-shot `dotnet ef database update` init step/job against the
  staging DB (same mechanism as the spike's `docker-compose.test.yml` migrate stage) — names the
  exact image+command.
- **CORS:** staging API `FRONT_URL` = the front-2 staging origin (single-origin CORS is fine for a
  dedicated staging API; **no multi-origin code change** while staging is isolated).
- **CSP/cookies:** `connect-src` includes the staging API origin; cookie domain set for the staging host.
- **Secrets:** staging env via Dokploy (DB conn, session keys) — never committed.
- **Smoke + rollback:** post-deploy smoke = the graduated spike `e2e/smoke` against
  `https://front-2-staging.<domain>/login`; **rollback** = redeploy the previous `:<sha>` image tag
  in Dokploy. **No production surface touched.**

## 8. Testing strategy

Three layers: (1) `shared-ts` unit tests for the folded pure core (api-failure, session, redaction,
query contracts); (2) `apps/front-2` e2e (harvested spike suites: CSP/nonce, log-leak sentinel,
ApiFailure mapping, auth, error-view 401-split, **a11y axe/keyboard**, smoke); (3) the parallel
characterization suite (§11 strategy) against `apps/front` with the **proven browser baseline from
M0.3**.

**Per-milestone exit gates (staging does not exist until M1.5, so the gate differs per milestone):**

- **M0 exit:** scaffold builds + `tsc` clean; M0.3 browser baseline green; M0.4 staging artifact
  written; M0.5 guide scaffolded. (No deploy.)
- **M1 pre-staging exit (M1.1–M1.4):** unit + e2e green **locally against the spike's compose
  harness** (the integration oracle until staging exists).
- **M1.5 exit:** staging live; deployed smoke green against the staging URL.
- **M2 exit:** staff-users beachhead production-grade at staging; characterization suite green and
  wired as the Phase-2 fan-out gate.

## 9. Risks / open items

- **Staging infra (D3/§7)** is the largest hidden-effort item — runbook authored up front to contain it.
- **Characterization is a hidden critical path** — the M0.3 browser baseline must land or Phase 2
  parity is undefined; the full suite must keep pace to gate Phase 2.
- **Table mini-spec** — highest UI risk; mitigated by cursor-pagination being the real requirement.
- **TanStack Start version drift** — re-pin/re-verify at M0.
- **Shared-fold seam discipline (§5.3)** — the query/client core is app-bound today; only pure code
  graduates and app pieces stay behind injected seams. If a "pure" module turns out to need runtime
  React/Query/Kiota, add the peer dep deliberately or keep it app-local — do not let app coupling
  leak into `shared-ts`.

## 10. References

- Strategy spec: `docs/superpowers/specs/2026-06-19-front-2-tanstack-heroui-migration-design.md`
- Phase 0 findings: `docs/superpowers/reviews/2026-06-19-front-2-phase-0-findings.md`
- Parity contract: `docs/front-2-migration/parity-contract.md`
- Error views: the retired app's error-view guide
- Adversarial reviews (Rev 2/3 inputs): GPT-5.5 xhigh — `.dump/phase1-spec-review-r1.out`,
  `.dump/phase1-spec-review-r2.out`
- Characterization issues: #693 (infra), #694 (design)
