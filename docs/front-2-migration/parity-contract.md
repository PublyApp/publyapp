# Front-2 Migration Parity Contract

This contract is the reusable invariant set for Phase 1. The
`apps/front-2-spike` implementation is disposable; these behaviors are not.
Each migrated page must preserve the relevant invariants against the current
`apps/front` behavior.

`Expected current-app behavior` is intentionally marked `Phase 1 confirm` unless
already proven by the existing spike evidence. The next task checks `apps/front`
against this contract.

## Phase-2 Fan-Out Gate

Every Phase-2 surface migration must keep the current-app golden reference
green before it can replace `apps/front` behavior. The blocking CI checks are:

- `front-unit`
- `front-e2e`

The `front characterization` workflow runs those checks on every pull request
so required checks cannot be left pending by workflow-level path filters. It
also runs on `develop` pushes for current-app, front-2 migration, API,
generated-client, shared package, workflow, and migration-doc changes. A
migration PR may add or strengthen front-2 parity assertions, but it must not
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
  column.
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
  Playwright Chromium. The repo dev `docker-compose.services.yml` crash-loops with
  the current `postgres:18-alpine` image (PG18 changed its data-dir convention,
  docker-library #1259, so the `…:/var/lib/postgresql/data` volume mount is
  rejected) — worked around with an **ephemeral** `postgres:18-alpine` container on
  `localhost:5454` (no volume). This dev-compose breakage is a separate repo bug to
  fix on its own.
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
| 4.4a / this commit | `apps/front-2-spike/e2e/parity-happy-path.spec.ts` |
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
