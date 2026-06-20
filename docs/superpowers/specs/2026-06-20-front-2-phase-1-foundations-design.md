# Front-2 Phase 1 — Foundations Design

**Status:** Approved design (brainstorm output). Source-of-truth for the Phase 1
implementation plan. Scoped to **Phase 1 only** — the durable-foundations layer of the
front-2 migration, NOT the full migration.

**Goal:** Stand up a durable `apps/front-2` carrying the proven foundation layer, deployed
continuously to staging, so Phase 2 can hand-build reference pages on solid ground.

**Parent strategy spec:** `docs/superpowers/specs/2026-06-19-front-2-tanstack-heroui-migration-design.md`
(this is the Phase 1 row of §10). **Phase 0 outcome:** GO — see
`docs/superpowers/reviews/2026-06-19-front-2-phase-0-findings.md`.

---

## 1. Context

Phase 0 shipped a disposable, containerized de-risking spike (`apps/front-2-spike`, now on
`develop`) and returned **GO**: TanStack Start + HeroUI v3 proven for SSR-on-Vite, dual-token
cookie auth, i18next SSR, a real Kiota/TanStack-Query/TanStack-Table list, an RHF/Zod dialog,
and CSP+nonce on every status — all behind a Traefik-shaped proxy with a green Playwright
suite. Phase 0 also caught and fixed a real 401-centralized-logout bug and produced a parity
contract documenting current-app divergences.

Phase 1 turns that proof into durable infrastructure. It is **foundations, not pages**: the
app shell, auth, i18n, CSP, theme, table system, and form-field layer — the substrate every
Phase 2/3 page is built on.

## 2. Decisions (approved)

| # | Decision | Rationale |
| --- | --- | --- |
| D1 | **Characterization tests run in parallel**, not first | The foundation plumbing was already proven by the spike's own Playwright suite + parity contract. The characterization suite's stated role (§11) is the **gate for every fan-out page** (Phase 2/3) — so it is the hard gate there, and is built alongside Phase 1 foundations, not blocking them. |
| D2 | **Fresh `apps/front-2`, deliberate harvest** | The spike was explicitly disposable; its value is the proven recipe + findings, not its code hygiene. A fresh app establishes durable conventions cleanly (real deps, no probe cruft, lint strictness). `apps/front-2-spike` stays as a read-only reference until `front-2` matches its coverage, then is deleted. Matches the spec's "harvested from the spike" wording. |
| D3 | **Staging stands up after the deployable shell** | Continuous staging's value is catching integration breaks, which needs something integrated to break. Stand up hosted Dokploy staging once the app-shell + auth land (end of M1), not before the first commit. Still gets weekly real-deploy signal for SSR/CSP/cookie behaviors during foundation-building. |
| D4 | **Thin shared-ts fold; bug-fix-only back-port to `apps/front`** | During a migration where `apps/front` is deleted at cutover, over-investing in shared abstractions for a dying app is waste. Fold only the genuinely framework-agnostic core front-2 needs; keep TanStack/HeroUI wiring app-local; do NOT refactor `apps/front` onto the new modules — except cherry-pick genuine production bug fixes (first: the 401-logout check) as standalone PRs. |

## 3. Scope

**In scope** — the 8 foundation items + 3 cross-cutting tracks:

- Fresh `apps/front-2` scaffold
- App shell + nav
- Auth/session
- i18n SSR
- CSP/nonce
- Default theme + dark-mode toggle (HeroUI defaults; brand primary only)
- The table system (HeroUI `Table` + `@tanstack/react-table`)
- The `Field.*` re-skin (RHF + Zod/InterZod over HeroUI inputs)
- Thin `shared-ts` client-core fold
- Continuous staging deploy
- Parallel characterization harness (#693/#694)

**Out of scope (deferred):**

- Real product pages beyond what's needed to exercise the foundations → Phase 2
- Bespoke brand theming / OKLCH token system → later decoupled phase (§15 of the strategy spec)
- The `<Image>` primitive — unless an M2 reference surface needs it
- Production cutover → Phase 4
- Deleting `apps/front-2-spike` — kept as read-only reference until `front-2` matches its coverage

**Definition of done:** `apps/front-2` deploys to hosted staging on every merge; auth / i18n /
CSP / shell / theme / table / `Field.*` all work there with the spike's invariants preserved
(**401-only logout, zero token logging, URL search-param state, InterZod validation errors**);
the characterization suite is green and wired as the **Phase-2 fan-out gate**.

## 4. Architecture

### 4.1 Durable app structure (TanStack Start idioms, mirroring `apps/front` separation where it transfers)

```
apps/front-2/src/
  router.tsx          # getRouter() + setupRouterSsrQueryIntegration; ssr.nonce per request
  server.ts           # custom server entry — emits CSP headers on every status (incl. 404)
  routes.ts           # Virtual File Routes tree
  routes/             # route modules (marketing/auth = SSR; authed = ssr:false / CSR)
  components/         # HeroUI primitives: app shell, Field.*, table system
  layouts/            # marketing / auth / authed layouts
  lib/                # app-local: kiota client factory, i18n wiring, server fns (cookie-I/O only)
  styles/             # app.css: @import tailwindcss + @heroui/styles + default theme + dark variant
  types/
  server.mjs          # srvx standalone Node entry (CMD node server.mjs)
```

### 4.2 Harvest map (spike → front-2), cleaned on the way in

Carried over and hardened: auth/session + `beforeLoad` guard + **401-only logout wired to both
error boundaries** · i18n SSR (cookie-driven, InterZod global error map) · CSP/nonce (custom
`server.ts`, nonce from `router.options.ssr.nonce`) · standalone `server.mjs`/srvx deploy · VFR
wiring · supply-chain policy (exact-pin, `--ignore-scripts`, `assert-pinned`, frozen lockfile).

Shortcuts fixed during harvest: real `@hookform/resolvers` (not the spike's local zodResolver);
`noUnusedLocals`/`noUnusedParameters` **on**; no probe routes; no "spike" naming; the path-scoped
spike CI promoted to a real `apps/front-2` workflow.

### 4.3 Thin `shared-ts` fold (delta over what's already shared)

`shared-ts/lib` already carries `csp`, `i18n`, `constants`, `zod` (InterZod) — reused as-is.
The thin fold **adds**:

- `lib/api-failure` — the `ApiFailure` discriminated union + `toApiFailure` **with the Phase-0
  status-parse fix** (reads `AppProblemDetails.status`; strict integer parse)
- `lib/session` — the dual-token cookie session model (parse/select staff vs tenant token)
- Kiota header-redaction helpers (never log `X-Session-Token`)

Framework-specific TanStack/HeroUI wiring stays **app-local** in `apps/front-2`. Each folded
module is unit-tested in `shared-ts`.

**Back-port to `apps/front`:** ONLY the 401 fix, and only if a check confirms `front` has the
same bug — as its own PR with a regression test, never a refactor onto the new shared modules.

### 4.4 Lint (§8 of the strategy spec)

Scoped to `apps/front-2/**` so `apps/front` stays governed by the MUI rules until cutover:

- **Retire** (for front-2): `no-native-html-in-mui-surfaces`, `no-raw-mui-textfield-register`,
  `no-raw-img-in-product-surfaces`
- **Add:** `no-server-fn-for-app-data` (enforces D4 boundary: `createServerFn` = cookie-I/O only)
  + Tailwind/HeroUI discipline rules + the React-Aria-protected-API rule
- **Keep** the portable rules: `no-direct-dayjs-in-components`, `no-console-in-source`,
  `no-array-reduce`, `no-manual-response-message-translation`

## 5. Milestone breakdown

### M0 — Bootstrap & safety net (parallel kickoff)

- **M0.1 — Fresh scaffold.** Create `apps/front-2` (TanStack Start + HeroUI v3, exact-pinned,
  supply-chain policy, `assert-pinned`, real CI workflow). Renders a styled placeholder, builds,
  `tsc` clean with `noUnusedLocals` on. No spike cruft. **Re-pin/re-verify TanStack Start version
  here** (Phase-boundary gate from the strategy spec §14).
- **M0.2 — Characterization track (parallel, #693/#694).** Land the test-infra design (#694) +
  infra (#693: Vitest + MSW + Playwright) and the **first** current-app characterization specs
  (auth redirects, 401-vs-403, zero token logging). Runs alongside M1/M2; feeds the Phase-2 gate.
- **M0.3 — 401 back-port check.** Verify whether `apps/front`'s real `toApiFailure`/logout wiring
  has the spike's 401 bug. If yes → fix as a standalone PR with a regression test. If no →
  document that it was spike-local.

### M1 — Deployable shell (gates staging standup)

- **M1.1 — shared-ts thin fold:** `lib/api-failure` (+ status-parse fix), `lib/session`, Kiota
  redaction helpers; unit-tested in `shared-ts`.
- **M1.2 — App shell + nav + default theme:** custom HeroUI shell (Navbar removed), dark-mode
  toggle (`useTheme`), brand primary; authed layout `ssr:false` (CSR), marketing/auth SSR.
- **M1.3 — Auth/session:** dual-token cookie, `beforeLoad` guard, login → cookie set → redirect,
  **401-only centralized logout wired to both error boundaries** (regression-tested).
- **M1.4 — i18n SSR + CSP/nonce:** cookie-driven locale + InterZod global map; CSP + per-request
  nonce on every status incl. 404 via custom `server.ts`.
- **M1.5 — Staging standup:** Dokploy staging app + proxy + staging API/DB; `front-2`
  continuous-deploys on merge; a deployed smoke (the spike's `e2e/smoke` graduated) runs against
  staging.

### M2 — Data & form systems

- **M2.1 — Table system** (own mini-spec per §8): HeroUI `Table` + `@tanstack/react-table`
  controller — **cursor-pagination parity** (matching the current MRT controller), search/sort,
  bulk-selection scaffolding, density, keyboard a11y. Column resize/pin/virtualization evaluated;
  built only if a parity surface needs them.
- **M2.2 — `Field.*` re-skin:** RHF + Zod/InterZod wrappers over HeroUI inputs (`Field.Text`,
  `Field.Select`, …), mirroring the current `Form`/`Field.*` API so Phase-2/3 pages port
  mechanically.
- **Exit:** the staff-users surface (the beachhead) runs production-grade on front-2 at staging;
  characterization suite green and wired as the **Phase-2 fan-out gate**.

## 6. Testing strategy

Three layers:

1. **`shared-ts` unit tests** for the folded core (api-failure mapping, session model, redaction).
2. **`apps/front-2` e2e** — the harvested + extended spike suites (CSP/nonce, log-leak sentinel,
   ApiFailure mapping, auth, smoke) run against staging.
3. **Characterization suite** (parallel track, §11) against `apps/front`, capturing invariants
   both apps must satisfy: auth redirects; 401-logout vs 403-no-logout; zero token logging; URL
   search-param state; query invalidation; InterZod errors + server `translationKey`; no-JS SSR
   HTML for marketing/auth; a11y for dialogs/menus/tables/focus.

**Per-milestone DoD = green suite + deployed-to-staging smoke**, not a vibe.

## 7. Staging mechanics

Dokploy app (GHCR image, `node server.mjs`/srvx) behind Traefik. Cross-origin requirements
(mapped by the spike): cookie domain + CORS `FRONT_URL` + CSP `connect-src` all configured for
the staging API origin. Per-merge deploy. **No production surface touched** (that is Phase 4).

## 8. Risks / open items

- **Table mini-spec** is the highest-UI-risk item — M2.1 may surface HeroUI `Table` gaps
  (resize/pin/virtualization) requiring scope calls. Flagged early; mitigated by cursor-pagination
  parity being the actual requirement (current app paginates, never mounts a virtualized grid).
- **Staging infra effort** (Dokploy staging app + DB) is new — M1.5 may need a dedicated infra pass.
- **TanStack Start version drift** — re-pin/re-verify at the M0 scaffold.
- **Characterization-track velocity** (#693/#694) must keep pace so it is green by M2 exit; if it
  lags, it becomes the long pole for Phase 2, not Phase 1.

## 9. References

- Strategy spec: `docs/superpowers/specs/2026-06-19-front-2-tanstack-heroui-migration-design.md`
- Phase 0 GO/NO-GO findings: `docs/superpowers/reviews/2026-06-19-front-2-phase-0-findings.md`
- Parity contract: `docs/front-2-migration/parity-contract.md`
- Characterization-test issues: #693 (infra), #694 (design)
