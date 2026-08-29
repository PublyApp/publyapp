# Front-2 Migration Parity Contract

This contract is the reusable invariant set for Phase 1. The disposable
proof-of-concept was removed in #965 after these behaviors were carried into
`apps/front-2` (now `apps/front`); the behaviors remain part of the migration
contract. Each migrated page must preserve the relevant invariants against the
current `apps/old-front` behavior.

`Expected current-app behavior` is intentionally marked `Phase 1 confirm` unless
already proven by the existing spike evidence. The next task checks `apps/old-front`
against this contract.

## Phase-2 Fan-Out Gate

Every Phase-2 surface migration must keep the current-app golden reference
green before it can replace `apps/old-front` behavior. The blocking CI checks are:

- `old-front-unit`
- `old-front-e2e`

The `old-front characterization` workflow runs those checks on every pull request
so required checks cannot be left pending by workflow-level path filters. It
also runs on `develop` pushes for current-app, front migration, API,
generated-client, shared package, workflow, and migration-doc changes. A
migration PR may add or strengthen front parity assertions, but it must not
weaken or remove the current-app characterization checks unless this contract
records an explicit follow-up decision.

## apps/front verification (Phase 0)

Checked on 2026-06-20 from worktree `spike/front-2-phase-0`.

Setup used:

- Reused the already-running local seeded Postgres on `localhost:5454` and API on
  `localhost:5000`; the API process was from the normal PublyApp dev checkout,
  read `.env.development`, reported `/health` healthy, and accepted
  `FRONT_URL=http://localhost:5050`.
- Started `apps/front` with `pnpm dev` / `node server.js`; startup loaded
  `.env.development`, copied i18n files, regenerated the Kiota client, and
  reported `http://localhost:5050`.
- Browser-rendered verification was not completed: `apps/front` exited with code
  `1` on the first `GET /login`, and `curl` reported `Empty reply from server`.
  A retry with `node --trace-uncaught --trace-warnings server.js` reproduced the
  same first-request exit without a stack trace.
- Fallback verification used the live API for auth/staff-users data and
  source/schema inspection for route wiring, RHF/Zod/InterZod validation, theme
  persistence, and locale selection.

Results:

- API verified seeded staff auth: `staff-admin@example.com` with the seed
  password returns `200`, and `/auth/redirect-code` returns `staff`.
- API verified invalid credentials: a syntactically valid wrong password returns
  RFC 7807 `400` with `translationKey: invalid-email-or-password`.
- API verified staff-users data: `/staff/users` returns
  `staff-admin@example.com`, `owner@publyapp.local`, and
  `staff-user@example.com`; `q=staff-admin` returns only
  `staff-admin@example.com`.
- Source verified current staff-users table shape: email is rendered as
  secondary text inside the first name/user cell, not as a standalone email
  column. **Superseded 2026-07-09 (owner-approved):** front-2 splits Name and
  Email into separate columns, matching the gray-ui template's `/customers`;
  the parity e2e asserts the Email columnheader is visible.
- Source verified invite affordance divergence: staff-users "Invite users" links
  to `/staff/invitations/new`; it does not open an on-page dialog. The new
  invitation route uses RHF + Zod/InterZod.
- Schema probe verified invite email messages: invalid email resolves to
  `Invalid email` in English and `e-mail non valide` in French; a valid email
  parses successfully.
- Source verified theme mechanism: the settings drawer dark-mode option updates
  MUI `useColorScheme`, Zustand settings, `publyapp:color-scheme`, and
  `publyapp:app-settings`.
- Source verified locale mechanism: `publyapp-locale` controls server-side
  language detection, client language changes persist that cookie, and InterZod
  is updated on `languageChanged`.

## apps/front browser baseline (M0.3)

Checked on 2026-06-26 from worktree `feat/front-2-phase-1` with headless
Chromium (Playwright), against the live current app.

Setup used:

- Fresh Dell dev machine: installed .NET SDK `10.0.102` (per `global.json`) and
  Playwright Chromium. The repo's former local compose Postgres (removed in
  #1722, replaced by the persistent Postgres in `apps/apphost`) used to crash-loop
  with the `postgres:18-alpine` image (PG18 changed its data-dir convention,
  docker-library #1259, so the `…:/var/lib/postgresql/data` volume mount was
  rejected) — worked around at the time with an **ephemeral** `postgres:18-alpine`
  container on `localhost:5454` (no volume). This dev-compose breakage was a separate
  repo bug to fix on its own.
- EF `database update` migrated + seeded the DB (3 tenants, 12 users, 3 staff
  profiles, 15 accounts). API `/health` healthy on `localhost:5000`. `apps/front`
  served on `localhost:5050` from the `feat/front-2-phase-1` worktree.

Phase-0 `GET /login` exit — RESOLVED:

- `GET /login` returns `200` (repeated requests, process stays alive). The Phase-0
  first-request exit (code `1` / `Empty reply from server`) did **not** reproduce.
  Root cause: it was specific to the disposable `spike/front-2-phase-0` worktree's
  environment (no clean workspace install / stack wiring), **not** a current-app
  defect. No code change required.

Browser-verified results (headless Chromium against the live app):

- Seeded staff login (`staff-admin@example.com`) redirects to **`/staff`** (the
  authenticated landing); the staff-users list lives at `/staff/staff-users`.
- Staff-users renders seeded rows: `staff-admin@example.com` and
  `owner@publyapp.local` visible. Columns are **`Name`, `Level`, `Status`,
  `Actions`** — confirming the divergence that email is secondary text in the
  `Name` cell, not a standalone column.
- Search writes snake_case URL state: searching `staff-admin` yields
  `/staff/staff-users?q=staff-admin`, keeps the matching row, and drops
  non-matching seeded rows.
- **Authed `401` → centralized logout → `/login`** (forced via route
  interception of `GET /staff/**`). Confirmed live.
- **Authed `403` → NO logout** (forced `403` keeps the user on
  `/staff/staff-users`). Confirmed live.
- Invalid credentials keep the user on `/login` and render an error without a
  route crash (current app returns RFC 7807 `400` for bad credentials).
- Login form selectors: `input[name="email"]` (no placeholder) and
  `input[name="password"]` (placeholder `8+ characters`), submit button
  `Sign in`. Note: the spike's e2e `login` helper used
  `getByPlaceholder('Email')`, which would **not** match the current app — a
  selector divergence to fix when the harness is enabled.

Code-verified (M0.3 Step 3 — no back-port needed):

- `apps/front/src/lib/api-failure/to-api-failure.ts:39` is body/problem-first
  (`problemDetails.status ?? problemDetails.responseStatusCode ?? 500`).
- `apps/front/src/lib/react-query/query-client.tsx:252,257` logs out on `401`
  ONLY (403/500/network/etc. do not).

Not browser-exercised here (remain source-verified / Phase-1 confirm): the
dark-mode toggle (mechanism source-verified in Phase 0; `data-mui-color-scheme`
is set after the settings interaction), the locale switch, and the invite flow.

## Evidence Legend

| Evidence | Scope |
|---|---|
| Group 3 / `74868beca` | Traefik TLS deploy, healthcheck, CSP on all statuses |
| 4.3 / `c3789268` | Method-aware route counts and no redundant staff-users fetch |
| 4.5a / `947efac0` | CSP enforced and per-request nonce on `/`, `/login`, authed shell, 404 |
| 4.5b / `209f826e` | Session token never logged |
| 4.6 / `55070a0b` | ApiFailure mapping: network, 500, timeout, reset, invalid JSON |
| 4.4a / this commit | `apps/front-2-spike/e2e/parity-happy-path.spec.ts` (the spike harness this contract was written against, removed in #965). The equivalent live gate is `apps/front-2/e2e/parity-happy-path.spec.ts`, added later by #723 — not by this commit. |
| Manual | Phase 1 must verify by inspection or a current-app-specific check |

## Auth

| Invariant | Verified by | Expected current-app behavior |
|---|---|---|
| Valid seeded staff login reaches the authenticated shell. | 4.4a / this commit, `valid staff login renders the seeded staff-users list` | Phase 0 API verified: `staff-admin@example.com` / seed password returns a session, and `/auth/redirect-code` returns `staff`. Not browser-verified in Phase 0 because `apps/front` exited on first `GET /login`; Phase 1 confirm the actual redirect lands on `/staff`. |
| Invalid credentials show an error and do not crash the route. | Manual | Phase 0 API/source verified: syntactically valid wrong credentials return RFC 7807 `400` with `translationKey: invalid-email-or-password`, and the login form renders `getSerializedErrorMessage(...)` in a MUI error `Alert`. Not browser-verified in Phase 0 because `apps/front` exited on first `GET /login`; Phase 1 confirm the localized alert renders without route crash. |
| An auth-surface `401` (login/auth page) stays on the auth surface and does NOT run authenticated app-data logout or clear an existing session. | Manual | Phase 1 confirm. |
| `401` from an authenticated data path triggers centralized logout and redirects to `/login`. | 4.6 / `55070a0b` | Phase 1 confirm: query/client error handling clears session and navigates to `/login`. |
| Logout is `401`-only: `403`, `500`, network failure, timeout, reset, and invalid JSON do not log the user out. | 4.6 / `55070a0b` | Phase 1 confirm: non-401 failures render the appropriate error state without clearing session. |
| Session token values are never written to browser or container logs. | 4.5b / `209f826e` | Phase 1 confirm using the current-app log-leak sentinel. |

## Staff-Users List

| Invariant | Verified by | Expected current-app behavior |
|---|---|---|
| The staff-users page renders seeded staff rows, including `staff-admin@example.com`. | 4.4a / this commit, `valid staff login renders the seeded staff-users list` | Phase 0 API/source verified: `/staff/users` returns `staff-admin@example.com`, `owner@publyapp.local`, and `staff-user@example.com`; `StaffUsersTable` maps these into MRT rows. Not browser-verified in Phase 0 because `apps/front` exited on first request; Phase 1 confirm visual rendering. |
| Staff list columns are `Name`, `Level`, `Status`, and `Actions`, with email rendered as secondary text in the `Name` cell. | 4.4a / this commit | Phase 0 source/API verified: current table columns are `Name`, `Level`, `Status`, and `Actions`, and email is shown as secondary text in the `Name` cell. |
| Search filters the list to matching rows and clearing search restores the seeded list. | 4.4a / this commit, `staff-users search filters and clears back to the seeded list` | Phase 0 API/source verified: `q=staff-admin` returns only `staff-admin@example.com`; the toolbar writes `q` to URL state and passes it to `useFindStaffUser`. Not browser-verified in Phase 0; Phase 1 confirm debounce/clear behavior in the UI. |
| A clean staff-users load issues exactly one `GET /staff/users` application data request. | 4.3 / `c3789268` | Phase 1 confirm: no duplicate browser/loader fetch for the migrated page. |

## Invite Dialog

| Invariant | Verified by | Expected current-app behavior |
|---|---|---|
| Invite entry stays route-based on staff-users page. | 4.4a / this commit, `invite dialog validates email through localized RHF and Zod wiring` | Phase 0 source verified divergence: current `apps/front` has no staff-users invite dialog; the `Invite users` affordance is a link to `/staff/invitations/new`. M2.3 beachhead kept current-app parity by routing invite entry to `/staff/invitations/new` with no on-page dialog. |
| Invalid email is rejected through the form validation stack and surfaces a localized InterZod/Zod message. | 4.4a / this commit; French locale covered by `configured French locale renders localized copy and InterZod messages` | Phase 0 schema/source verified: `/staff/invitations/new` uses RHF + `zodResolver(getBulkCreateInvitationsSchema(interZodClient))`; invalid email resolves to `Invalid email` in English and `e-mail non valide` in French. Not browser-verified in Phase 0. |
| Correcting the email clears the validation error and leaves submit enabled. | 4.4a / this commit | Phase 0 schema verified: the same invitation schema rejects `not-an-email` and accepts `new-staff@example.com` with a valid profile UUID. Not browser-verified in Phase 0; Phase 1 confirm RHF visual error clearing and submit enabled state. |
| Successful submit follows the current app's invite mutation/error handling contract. | Manual | Phase 1 confirm against current app; the spike submit is intentionally no-op and does not mutate seed data. |

## Theme

| Invariant | Verified by | Expected current-app behavior |
|---|---|---|
| The dark-mode toggle changes the actual document theme state. | 4.4a / this commit, `dark-mode toggle changes the html theme and persists after reload` | Phase 0 source verified: current app toggles dark mode from the settings drawer via MUI `useColorScheme().setMode(...)` and mirrors the value into app settings. Not browser-verified in Phase 0. |
| The selected theme persists across reload. | 4.4a / this commit | Phase 0 source verified: current app persists MUI mode in `publyapp:color-scheme` and full settings in `publyapp:app-settings`. Not browser-verified in Phase 0; Phase 1 confirm reload behavior. |

## I18n

| Invariant | Verified by | Expected current-app behavior |
|---|---|---|
| The configured language renders localized app strings. | 4.4a / this commit, `configured French locale renders localized copy and InterZod messages` | Phase 0 source verified: server SSR reads `publyapp-locale`, initializes i18next with `en`/`fr` resources, and client language changes persist the same cookie. Not browser-verified in Phase 0. |
| InterZod validation messages resolve through the active locale. | 4.4a / this commit | Phase 0 schema/source verified: InterZod updates on `languageChanged`; invalid email resolves to `Invalid email` in English and `e-mail non valide` in French. |
| UI language switching exists only if the app exposes a switcher. | Manual | Phase 0 source verified: current app exposes a language popover/user-menu item, while the spike has no UI switcher and only proves cookie-configured language. Current-app language switcher behavior/placement is preserved when the shell/user-menu surface is migrated. |

## M2.0b Staff-Users Parity Decisions

- Invite entry: keep current-app parity. Staff-users “Invite users” stays a link to `/staff/invitations/new` (no on-page dialog for the M2.3 beachhead).
- Email display: keep current-app parity. Staff-users columns remain `Name`, `Level`, `Status`, `Actions`; email stays secondary text inside the `Name` cell.
- Language switcher: keep current-app parity. Preserve existing language switcher behavior and placement when migrating the relevant shell/user-menu surface.

## URL State

| Invariant | Verified by | Expected current-app behavior |
|---|---|---|
| Staff-users table URL state round-trips `q` (search) and `size` (page size) and rehydrates those visible controls on load. | Manual | Phase 1 confirm. |
| Staff-users table URL state round-trips `sort_id`, `sort_order`, `cursor`, and resets stale `cursor` when search changes. | Manual | Phase 1 confirm — characterization backlog, not in the first Phase-2 gate. |

## Cross-Cutting

| Invariant | Verified by | Expected current-app behavior |
|---|---|---|
| CSP is enforced and each SSR request gets a nonce on `/`, `/login`, authed shell, and 404. | 4.5a / `947efac0` | Phase 1 confirm on the current app's equivalent routes. |
| Deployed proxy serves the app behind Traefik TLS, healthchecks pass, and CSP is present on success and error statuses. | Group 3 / `74868beca` | Phase 1 confirm for the migrated deployment shape. |
| ApiFailure maps network, 500, timeout, reset, and invalid JSON to an error view without crash or logout. | 4.6 / `55070a0b` | Phase 1 confirm via current-app equivalent fault injection. |
| Staff-users route-count checks are method-aware, so CORS `OPTIONS` is not mistaken for duplicate app data. | 4.3 / `c3789268` | Phase 1 confirm using method-specific request counting. |
| Session tokens are redacted from deployed logs and browser diagnostic channels. | 4.5b / `209f826e` | Phase 1 confirm with current-app log capture. |

## Known Divergences / Phase-1 Watch-Items

- ApiFailure status precedence diverges only for malformed responses: the spike is
  transport-status-first, while `apps/front` is body `status`-first. They are
  identical for well-formed RFC 7807 responses.
- M2.0b decision: preserve current-app invite UX parity for staff-users; keep the link to `/staff/invitations/new` (no on-page dialog for the M2.3 beachhead).
- M2.0b decision: preserve current-app staff-users email presentation; keep table columns `Name`, `Level`, `Status`, `Actions`, with email as secondary text in the `Name` cell.
- M2.0b decision: preserve current-app language-switcher behavior/placement in the shell/user-menu surface; do not remove or replace without later explicit decision.
- `style-src` can only be tightened in Phase 1 if a positive nonce/hash path
  exists. 4.5a observed only `style-src-elem`, no `style-src-attr`, and the
  spike has no positioned overlay surface yet.
- HeroUI license gate is **resolved to GO** (Phase 0, 2026-06-20): at the pinned tag
  `v3.2.1`, npm metadata declares MIT and the repo `LICENSE` is Apache-2.0 — both
  OSI-permissive, neither blocks closed-source SaaS use, so Phase 1 token/design work is
  **not** blocked. Carry-forward is attribution/NOTICE hygiene only. See the Phase 0
  findings "License gate → Resolution (2026-06-20)".
- Detail-page body grid width: SPEC 2c/2h describe a `1fr / 372px` body grid
  with no max-width (the JSON-backed assertion coverage for this same grid is
  keyed under artboard IDs `2a`, `2h`, and `3b` in `artboard-assertions.ts`),
  which stretches edge-to-edge on large monitors. **Superseded 2026-07-10
  (owner-approved):** the detail content column is capped at
  `max-width: 1440px` (centered) and the aside widens `372px → 420px`. This is
  a deliberate deviation from the canvas, not a parity gap —
  `artboard-assertions.ts` ('2a', '2h', '3b') and `detail-layout.tsx`/its test
  were updated to assert `1fr 420px` accordingly.
- Card surface treatment: SPEC `:60`/`:67`/`:75` describe cards as ring-only
  (`box-shadow: 0 0 0 1px rgba(24,24,27,0.06)`), matching the canvas's most
  common card ring. **Superseded 2026-07-10 (owner-approved):** the
  `gray-ui-csm` template wins over the canvas here — `components/ui/card.tsx`
  now composes the ring with a `shadow-md`-equivalent elevation
  (`--publy-shadow-elevated`), matching the template's
  `shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10`. This also
  surfaced a real bug: `--publy-shadow-ring`/`--publy-shadow-card` had no
  `html.dark` override, so on the new `#18181b` dark base the ring
  composited to `#18181b` exactly — every dark-mode card outline was
  invisible. Light ring retuned to `rgba(9,9,11,0.05)` (was
  `rgba(24,24,27,0.06)`, near-identical, now traces to the template's
  `--foreground` token); dark ring added at `rgba(250,250,250,0.10)`
  (composites to `#2f2f31` on `#18181b` — visible).
  `artboard-assertions.ts` ('5f', `settings.card` box-shadow) updated to the
  retuned light ring value. Only `components/ui/card.tsx` (the base Card
  primitive) adopts the new elevated token; other ring consumers
  (`.publy-metric-tile`, `.publy-metadata-card`, `.publy-state-surface`,
  `.publy-table-card`, and the ad-hoc `shadow-[var(--publy-shadow-ring)]`
  panels in the staff-user/tenant detail routes) keep the bare ring — they
  read as flat page chrome, not raised cards, and `.publy-table-card` is
  explicitly commented as a "ring card" by design. They still pick up the
  dark-mode visibility fix and the light retune via the shared token.
- Card surface treatment, round 2: the elevation adopted above (2026-07-10,
  "owner-approved") **is itself superseded 2026-07-10 (owner decision R2-1)**.
  Having seen the `shadow-md + ring` result, the owner judged elevation was
  not the problem and asked for it removed: `components/ui/card.tsx` drops
  `--publy-shadow-elevated` and goes back to `shadow-[var(--publy-shadow-ring)]`,
  restoring SPEC's original ring-only card treatment. Only the alpha changes
  from SPEC's `0.05`/`0.06` mix to a flat `0.06` in both themes —
  `--publy-shadow-ring`/`--publy-shadow-card` are now
  `rgba(9, 9, 11, 0.06)` (light) and `rgba(250, 250, 250, 0.06)` (dark,
  composites to `#262628` on `#18181b`). The owner explicitly accepted that
  this dark value is fainter than the `0.10` that fixed the invisible-ring
  bug in round 1, but still visible. `--publy-shadow-elevated` stays declared
  — its only remaining consumer is `.publy-state-icon` in `app.css`, which
  goes flat under a separate packet (R2-2); the token is deleted then, not
  before. `artboard-assertions.ts` ('5f', `settings.card` box-shadow) updated
  to `rgba(9,9,11,0.06)`.
- Table column geometry: SPEC's list grids assume columns that do not exist in
  the current data model. **Adapted 2026-07-10 (captain-approved deviation):**
  `2g` profiles (`40/240/1fr/104/140/120/40`) and `2i` invitations
  (`40/300/116/1fr/150/120/128/40`) map 1:1 to implemented columns and use the
  literal SPEC pixel values. `2b` staff-users and `3a` tenants do not: SPEC 2b
  assumes Role/Profiles/2FA/Last-active and SPEC 3a assumes Plan/Owner/Created,
  none of which the API returns (see BACKLOG "Deferred contract work"). For
  those two, columns with a direct SPEC counterpart keep their literal widths
  (staff-users Name 200, Level 104, Status 122; tenants Status 124, Users 92,
  Created 132) and the longest free-text field absorbs the remainder as the
  fluid column (staff-users Email; tenants Name). Revisit both grids when the
  missing columns land — the SPEC values are not wrong, they are unreachable.
  Enforcement is `<colgroup>` + `table-layout: fixed` on `.publy-data-table`;
  a column with no `width` meta is the fluid one. e2e asserts computed pixel
  widths and that `table.scrollWidth <= card.clientWidth` (owner item 15a).
- Empty/no-match/error state composition: SPEC 2f describes the shared list
  states as flat icon tiles — empty `48px r14 #f4f4f5` tile, error
  `52px r16` rose tile. **Superseded 2026-07-10 (owner-approved, P5 items
  4+14):** the owner rejected both the error views and the list empty states
  outright ("bump the creativity"); this was a build-one-strong-direction
  task with no mockup round. Both surfaces now share one composition: a
  `.publy-state-icon-cluster` (96px) layering a tone-tinted radial wash
  (`.publy-state-icon-wash`), two concentric rings (`.publy-state-icon-ring
  --outer`/`--inner`), and the glyph tile on top — tile size/radius unified
  at `56px` / `16px` (`--publy-radius-frame`) across tones, differing only by
  color (neutral gray "empty" / primary gold "no-match, an escape hatch" /
  danger rose "error"). `NoMatchStateSurface` moved from `tone="neutral"` to
  `tone="primary"` so empty and no-match no longer read as the same state
  with a different icon. `AppErrorView` gained a ghosted numeral (parsed from
  the leading digits of the `code` prop) behind the cluster, clipped to the
  hero row, plus `tone`/`embedded` props — `embedded` drops the forced
  `min-h-screen` when the view renders inside an existing route shell (the
  tenant details shell). New tokens: `--publy-state-wash-{neutral,danger,
  primary}` / `--publy-state-ring-{neutral,danger,primary}`, declared in both
  the light and dark blocks as `color-mix()` derivations of already-themed
  tokens. `design-handoff-foundation.spec.ts` and `artboard-assertions.ts`
  (`2f`, `empty.iconTile` radius) were rewritten to the new values, not
  loosened. `View404`/`View403` also stopped doing a full-document
  `window.location.assign('/')` on "Return home" (a TanStack `Link` now) and
  had every string routed through `t()`.
- Empty/no-match/error state composition, round 2: the layered glyph-cluster
  composition adopted above (2026-07-10, "owner-approved, P5 items 4+14"),
  and the P5 `AppErrorView` change that wrapped the whole view in `<Card>`,
  are both **superseded 2026-07-10 (owner-approved, round 2 — decision
  R2-2)**. The owner rejected the boxed card container a second time and
  asked for something flat. `AppErrorView` no longer renders a `<Card>` —
  `<main>` carries `data-testid` directly and contains the content at page
  background, with a hairline `border-t` (no box, no fill) separating the
  actions row and the diagnostic-id row instead of a bordered footer panel.
  `.publy-state-surface` (the `DataTable` empty/error/no-match states) drops
  its `background`/`border-radius`/`box-shadow: var(--publy-shadow-ring)` —
  it now sits directly on the page background with no card treatment at all.
  The layered glyph cluster (wash + two rings + a shadowed, background-filled
  tile) is retired for a bare, un-boxed icon: `.publy-state-icon-cluster`
  shrinks from a fixed `96px` layered composition to a plain sizing wrapper
  (`40px` in list states via `.publy-state-surface`, `64px` in the
  `AppErrorView` hero via a `.publy-error-hero .publy-state-icon-cluster`
  override), and `.publy-state-icon` is now `color`-only per tone (neutral
  `--publy-foreground-muted`, danger `--publy-danger`, primary
  `--publy-primary`) with no background, shadow, or radius. The ghost numeral
  behind the error-view icon stays (a large tonal display numeral reads as
  "designed" without a container) and grows slightly (`96px → 112px`,
  `opacity 0.06/0.09 → 0.05/0.08`) now that nothing else fills the page.
  Deleted, not orphaned: `--publy-shadow-elevated` (light + dark; its last
  consumer, `.publy-state-icon`'s box-shadow, is gone), `--publy-state-wash-
  {neutral,danger,primary}` / `--publy-state-ring-{neutral,danger,primary}`
  (light + dark, the wash/ring layers are gone), and `--publy-radius-frame`
  (the tile radius is gone). `design-handoff-foundation.spec.ts` (the
  no-match glyph-cluster test) and `artboard-assertions.ts`/
  `artboard-assertions.test.ts` (`2f`, `empty.iconTile`/`error.iconTile` →
  `empty.icon`/`error.icon`) were rewritten to the new flat geometry, not
  loosened — the no-match e2e test now also asserts `background-color:
  rgba(0,0,0,0)` and `box-shadow: none` on both the state surface and the
  icon, to pin the "no box" claim as a computed value rather than a
  structural absence. `state-surface.test.tsx` gained a test asserting the
  wash/ring elements are gone from the DOM. Text colors were re-verified
  against `--publy-background` rather than `--publy-card`: the two tokens
  are identical in both themes (`#ffffff` / `#18181b`), so the existing
  `text-foreground`/`text-muted-foreground` contrast ratios (title ~16:1,
  description/code `~4.82:1` light, `~6.91:1` dark) carry over unchanged —
  removing the card did not change any background a reader sees text
  against. `AppErrorView`'s `embedded` prop, `View404`/`View403`, every
  `data-testid`, and `StateSurface`/`ErrorStateSurface`/`NoMatchStateSurface`'s
  public props are unchanged by this pass.
- Empty/no-match/error state composition, round 3 (2026-07-10, owner-approved
  — decisions R3-1 through R3-4b): the flat direction from round 2 is
  approved ("fits better my taste") and not reopened; four concrete issues
  were fixed. **R3-1 (valorize the icon):** the glyph grows from a bare
  `22px` to `40px` at inline scale (`StateSurface`) and `48px` at page scale
  (`AppErrorView`) — still no disc/ring/box, presence comes from size, tone
  colour, and the stroke weight that scales up with it.
  `.publy-state-icon-cluster` takes a `data-scale="inline"|"page"` attribute
  driving its box size, and `.publy-state-icon svg { width/height: 100% }`
  sizes the glyph off that box regardless of any `size-*` utility class a
  call site puts on its own icon element — so none of the ~30 `AppErrorView`
  call sites needed touching. Tone colours are unchanged
  (`--publy-foreground-muted` / `--publy-danger` / `--publy-primary`, all
  declared in `:root`). **R3-2 (remove the ghost numeral):** the round-2
  ghost numeral read as a smudge and duplicated the eyebrow `code` line, so
  `.publy-error-ghost-numeral`, `.publy-error-hero` (base + the
  `.publy-error-hero .publy-state-icon-cluster` 64px override), and
  `html.dark .publy-error-ghost-numeral` are deleted from `app.css`, and the
  `ghostNumeral` const/JSX are gone from `AppErrorView.tsx`. **R3-3 (remove
  the separator):** the `border-t border-border pt-6`/`pt-3` hairlines above
  the actions row and the diagnostic-id row are gone; both sit below the
  description with plain vertical spacing. **R3-4a (500 gets actions):**
  `__root.tsx`'s `RootErrorBoundary`, `authed/layout.tsx`'s
  `AuthedLayoutErrorBoundary` (extracted from an inline `errorComponent` so
  it could legally call `useRouter()`/`useTranslation()`) and its
  `AuthedRouteLayout` query-error branch, and `login.tsx`'s
  `LoginErrorBoundary` now render a primary "Try again" (`t('retry')`) that
  calls `reset()` + `router.invalidate()` on route boundaries or
  `query.refetch()` on query-driven 500s, plus a secondary "Go to home"
  `Link`. Every other 500 renderer found in the tenant/profile/staff-user
  detail and edit routes (17 files) was extended the same way, wired to
  whichever query actually produced the error — `TenantDetailsError` in
  `_tenant-details-shell.tsx` gained an optional `onRetry` and a shared
  `TenantRetryActions` (Try again + Back to tenants) reused by its 10
  callers; the 400/404 tenant views there gained a "Back to tenants" link
  they previously lacked entirely. No 500 renderer was left without a retry
  path. **R3-4b (unify empty/error primitives):** `AppErrorView` and
  `StateSurface` now both render a new `~/components/ui/state-view.tsx`
  (`StateView`) — icon-cluster, optional eyebrow, title, optional
  description, and actions, with a `scale: 'page' | 'inline'` prop driving
  typography (page: `<h1>` + `text-3xl`; inline: `.publy-type-section-title`)
  and the icon-cluster's size. `AppErrorView`'s `errorDetails`/`diagnosticId`
  and `StateSurface`'s `technicalIdentifier` — none of which are structural
  to the shared shape — pass through as generic `beforeActions`/
  `afterActions`/`belowTitle` slots so both components' full public prop
  surfaces compile untouched. Every `data-testid` (`view-404`, `view-403`,
  `${testId}-empty/-no-match/-error/-loading`,
  `staff-tenant-details-invalid/-not-found/-error`) is unchanged, and
  `AppErrorView` still renders correctly `embedded` inside
  `tenants/$tenantId/_tenant-details-shell.tsx`.
  `design-handoff-foundation.spec.ts` (`2f`, `error.icon` width `64px →
  48px`) and `artboard-assertions.ts`/`artboard-assertions.test.ts` were
  updated to the new sizes, not loosened; `state-surface.test.tsx` gained
  tests for the `data-scale` attribute, the shared `AppErrorView`/
  `StateSurface` primitive, and the absence of the ghost numeral/separator.
- Malformed-id → not-found parity, and empty/error scale unification
  (2026-07-11, owner-approved, packet P14): two follow-ups on top of round 3.
  **Malformed ids render not-found, not a distinct 400 view:** the backend
  returns `400` for a malformed id and `404` for a missing entity, but the 9
  staff detail/edit routes each rendered a separate "Invalid ... link" view
  (`…-invalid` testId) for the 400 case. The `…-invalid` branches and views
  are deleted from all 9 routes; their condition is folded into the existing
  `…-not-found` branch (`isProblemStatus(error, 404) ||
  isProblemStatus(error, 400, MALFORMED_ID_TRANSLATION_KEY)`), matching the
  precedent already in `invitations/$invitationId.tsx`. The `…-invalid`
  testId no longer exists anywhere in the app; every spec that asserted it
  was flipped to assert the corresponding `…-not-found` view rather than
  deleted or loosened. **Empty state now matches error scale exactly
  (owner-approved 2026-07-11, reaffirming/superseding R3-4b's "inline stays
  smaller"):** `StateView`'s `scale="inline"` and `scale="page"` branches now
  render identical title (`text-3xl font-semibold leading-tight`),
  description (`text-sm text-muted-foreground`), and actions-cluster
  (`mt-8 flex w-full flex-wrap justify-center gap-2`) classes, and
  `.publy-state-icon-cluster` collapses to a single 48px size (the
  `data-scale="inline"|"page"` attribute is still emitted for tests but no
  longer drives different CSS). The now-dead `.publy-state-surface
  .publy-type-section-title`/`.publy-type-helper` shrink overrides are
  deleted from `app.css` since nothing routes inline text through those
  classes anymore. `design-handoff-foundation.spec.ts`'s no-match geometry
  test and `artboard-assertions.ts`'s `2f`/`empty.icon` entry (`40px →
  48px`) were re-pinned to the new value, not loosened. Back-links
  (`.publy-back-link`) also switched from `IconChevronLeft` to
  `IconArrowLeft` across the 5 files that render one; `data-table.tsx`'s
  pagination chevron is unrelated and untouched.
- Dashboard secondary panel, round 2 (2026-07-10, owner decision R2-3):
  SPEC `:49` and artboard 2a describe the dashboard module as rail-only, with
  no secondary panel and therefore no sidebar toggle available there — the
  first deviation on this axis was round-1 decision 7 (sidebar toggle always
  in the topbar, open/closed state is user intent and persists across
  navigation). Round 2 goes further: the owner wants the toggle available on
  `/staff/dashboard` specifically, which requires the module to actually have
  panel content (`shouldShowSecondaryPanel`/`canToggleSecondaryPanel` both
  gate on `secondaryItems.length >= 2`). `/staff/dashboard` previously had no
  route at all (`routes.ts` declared nothing for it, so it rendered the
  not-found view); this packet adds the route plus three nested children —
  Overview (`/staff/dashboard`, index), Activity (`/staff/dashboard/activity`),
  Reports (`/staff/dashboard/reports`) — and gives the `dashboard` rail item's
  `secondaryItems` three real `DASHBOARD_MODULE_ITEMS` entries in
  `route-metadata.tsx` instead of `[]`. Page content is deliberately minimal
  placeholder text (no fabricated metrics/charts) — the 2a visual build is a
  separate packet. The `>= 2` panel-visibility threshold itself was not
  touched; three destinations simply now satisfies it the same way every
  other module does.
