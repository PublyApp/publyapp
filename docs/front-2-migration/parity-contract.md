# Front-2 Migration Parity Contract

This contract is the reusable invariant set for Phase 1. The
`apps/front-2-spike` implementation is disposable; these behaviors are not.
Each migrated page must preserve the relevant invariants against the current
`apps/front` behavior.

`Expected current-app behavior` is intentionally marked `Phase 1 confirm` unless
already proven by the existing spike evidence. The next task checks `apps/front`
against this contract.

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
| Valid seeded staff login reaches the authenticated shell. | 4.4a / this commit, `valid staff login renders the seeded staff-users list` | Phase 1 confirm: `staff-admin@example.com` / seed password signs in and lands on the staff surface. |
| Invalid credentials show an error and do not crash the route. | Manual | Phase 1 confirm: login remains usable and shows the current localized invalid-login message. |
| `401` from an authenticated data path triggers centralized logout and redirects to `/login`. | 4.6 / `55070a0b` | Phase 1 confirm: query/client error handling clears session and navigates to `/login`. |
| Logout is `401`-only: `403`, `500`, network failure, timeout, reset, and invalid JSON do not log the user out. | 4.6 / `55070a0b` | Phase 1 confirm: non-401 failures render the appropriate error state without clearing session. |
| Session token values are never written to browser or container logs. | 4.5b / `209f826e` | Phase 1 confirm using the current-app log-leak sentinel. |

## Staff-Users List

| Invariant | Verified by | Expected current-app behavior |
|---|---|---|
| The staff-users page renders seeded staff rows, including `staff-admin@example.com`. | 4.4a / this commit, `valid staff login renders the seeded staff-users list` | Phase 1 confirm: current seeded staff rows render, including the staff admin. |
| Staff list columns are present for email, name, status, and level. | 4.4a / this commit | Phase 1 confirm: equivalent columns/row data are present, even if component markup differs. |
| Search filters the list to matching rows and clearing search restores the seeded list. | 4.4a / this commit, `staff-users search filters and clears back to the seeded list` | Phase 1 confirm: current search semantics match the API query behavior. |
| A clean staff-users load issues exactly one `GET /staff/users` application data request. | 4.3 / `c3789268` | Phase 1 confirm: no duplicate browser/loader fetch for the migrated page. |

## Invite Dialog

| Invariant | Verified by | Expected current-app behavior |
|---|---|---|
| The invite dialog opens from the staff-users page. | 4.4a / this commit, `invite dialog validates email through localized RHF and Zod wiring` | Phase 1 confirm: current invite affordance opens the dialog. |
| Invalid email is rejected through the form validation stack and surfaces a localized InterZod/Zod message. | 4.4a / this commit; French locale covered by `configured French locale renders localized copy and InterZod messages` | Phase 1 confirm: RHF + Zod/InterZod produce localized validation messages. |
| Correcting the email clears the validation error and leaves submit enabled. | 4.4a / this commit | Phase 1 confirm: valid input clears the error without stale form state. |
| Successful submit follows the current app's invite mutation/error handling contract. | Manual | Phase 1 confirm against current app; the spike submit is intentionally no-op and does not mutate seed data. |

## Theme

| Invariant | Verified by | Expected current-app behavior |
|---|---|---|
| The dark-mode toggle changes the actual document theme state. | 4.4a / this commit, `dark-mode toggle changes the html theme and persists after reload` | Phase 1 confirm: the migrated app changes the same effective theme state the current app uses. |
| The selected theme persists across reload. | 4.4a / this commit | Phase 1 confirm: reload preserves the user's selected mode. |

## I18n

| Invariant | Verified by | Expected current-app behavior |
|---|---|---|
| The configured language renders localized app strings. | 4.4a / this commit, `configured French locale renders localized copy and InterZod messages` | Phase 1 confirm: `publyapp-locale` selects the current-app language resources. |
| InterZod validation messages resolve through the active locale. | 4.4a / this commit | Phase 1 confirm: Zod validation uses the active `zod` namespace and not hardcoded English. |
| UI language switching exists only if the app exposes a switcher. | Manual | Phase 1 confirm: the spike has no UI switcher; it proves cookie-configured language only. |

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
- `style-src` can only be tightened in Phase 1 if a positive nonce/hash path
  exists. 4.5a observed only `style-src-elem`, no `style-src-attr`, and the
  spike has no positioned overlay surface yet.
- HeroUI license is `PENDING-UPSTREAM`; Phase 1 token/design work remains blocked
  until upstream confirms the governing license for HeroUI v3.
