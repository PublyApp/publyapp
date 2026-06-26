# Front-2 Migration Characterization Plan

This document defines the first characterization specs for the current
`apps/front` application. These are golden-master tests: they pin the behavior
that exists today so `apps/front-2` can be proven at parity before Phase 2
fan-out.

This track belongs to:

- #693: current-app test infrastructure in `apps/front` with Vitest, MSW, and
  Playwright.
- #694: current-app characterization testing design.
- #700: the front-2 migration epic.

The assertion shapes below are authored against the M0.3 current-app baseline.
M0.3 captures the current-app browser/API baseline values; this document lists
what must be asserted with those values before the specs become the Phase-2
fan-out gate.

## Locked Current-App Facts

| Fact | Source | Characterization requirement |
|---|---|---|
| ApiFailure status precedence is body/problem-first: `problemDetails.status ?? responseStatusCode ?? 500`; validation failures follow the same body-first shape. | `apps/front/src/lib/api-failure/to-api-failure.ts` | Tests must assert body status wins over transport status for parseable conflicting RFC 7807 bodies, then falls back to transport status, then defaults to `500`. Invalid JSON and malformed responses are covered separately as non-logout error handling. |
| Centralized logout fires only on `401`. | `apps/front/src/lib/react-query/query-client.tsx` | Tests must assert `401` logs out only on authenticated app-data paths, and that `403` never logs out. |
| Auth-surface `401` is not an authenticated app-data `401`. | `docs/front-2-migration/parity-contract.md` Auth | Tests must assert auth-page failures stay on the auth surface and do not clear an existing authenticated session. |

## Auth Characterization

| Stable spec name | Behavior under test | Parity invariant | Layer | Concrete assertion |
|---|---|---|---|---|
| `auth.login.redirects_seeded_staff_to_scope_home` | Valid seeded staff login redirects to the current staff landing target. | Auth: Valid seeded staff login reaches the authenticated shell. | Playwright-e2e | Submit the M0.3 seeded staff credentials on `/login`; assert the final URL and primary authenticated shell marker exactly match the M0.3 captured staff redirect target. |
| `auth.login.seeded_staff_redirect_code_reaches_staff_shell` | Login redirect follows the current seeded staff redirect-code result. | Auth: Valid seeded staff login reaches the authenticated shell. | MSW-integration | Mock successful seeded staff login plus the M0.3 `/auth/redirect-code` response of `staff`; assert navigation chooses the captured current-app staff target and shell marker. |
| `auth.login.invalid_credentials_renders_localized_problem` | Invalid credentials render an error and do not crash the route. | Auth: Invalid credentials show an error and do not crash the route. | Playwright-e2e | Submit a syntactically valid wrong password; assert the login route remains mounted, no authenticated shell is shown, and the alert text/translation key matches the M0.3 baseline. |
| `auth.failure.auth_surface_401_does_not_logout` | A `401` produced by an auth-surface action stays on the auth surface and does not run authenticated app-data logout. | Auth: An auth-surface `401` (login/auth page) stays on the auth surface and does NOT run authenticated app-data logout or clear an existing session. | Playwright-e2e | Start with an authenticated browser session, replay the M0.3 captured `/login` form action where `apiClient.auth.login.post` returns `401`, and assert this auth-surface `401` renders the current login error state, keeps the current session cookie/token state unchanged, and does not redirect through authenticated app-data logout. Note: Phase 0 verified the current app returns RFC 7807 `400`, not `401`, for invalid credentials, so this spec pins auth-surface robustness for a synthetic/forced `401`. |
| `auth.failure.authed_query_401_logs_out_once` | A `401` from authenticated app-data query handling clears session and redirects to `/login`. | Auth: `401` from an authenticated data path triggers centralized logout and redirects to `/login`. | Playwright-e2e | From the authenticated `/staff/users` route, force the first method-specific `GET /staff/users` app-data request to return RFC 7807 `401`; assert one logout transition, cleared auth state, final `/login` URL, and no repeated redirect loop. |
| `auth.failure.authed_mutation_401_logs_out_once` | A `401` from authenticated mutation handling uses the same centralized logout path. | Auth: `401` from an authenticated data path triggers centralized logout and redirects to `/login`. | MSW-integration | From `/staff/invitations/new`, submit the M0.3 valid bulk invite form and force `POST /staff/invitations/bulk` to return RFC 7807 `401`; assert the auth-error callback fires exactly once with status `401`, auth state is cleared, the final navigation target is `/login`, no repeated logout/redirect loop occurs, and no success/error toast path masks the logout. |
| `auth.failure.authed_403_does_not_logout` | `403` is forbidden, not invalid session. | Auth: Logout is `401`-only: `403`, `500`, network failure, timeout, reset, and invalid JSON do not log the user out. | Playwright-e2e | From an authenticated staff route, force app-data `GET` to return RFC 7807 `403`; assert the current session remains present, `/login` is not visited, and the current-app forbidden/error view matches M0.3. |

## ApiFailure And Query Handling

| Stable spec name | Behavior under test | Parity invariant | Layer | Concrete assertion |
|---|---|---|---|---|
| `api_failure.problem_body_status_wins_over_transport_status` | Problem body status takes precedence over Kiota/transport status. | Known Divergences / Phase-1 Watch-Items: ApiFailure status precedence diverges only for malformed responses; `apps/front` is body `status`-first. | Unit | Pass an error object whose parseable RFC 7807 body status and `responseStatusCode` conflict; assert `toApiFailure(error).status` equals the body `status`. |
| `api_failure.validation_body_status_wins_over_transport_status` | Validation body status takes precedence and preserves field errors. | Known Divergences / Phase-1 Watch-Items: ApiFailure status precedence diverges only for malformed responses; `apps/front` is body `status`-first. | Unit | Pass a validation problem with body `status`, conflicting `responseStatusCode`, and `errors`; assert `kind: "validation"`, body-first status, and exact field-error preservation. |
| `api_failure.transport_status_used_when_body_status_missing` | Transport status is the fallback when a parseable problem body omits `status`. | Known Divergences / Phase-1 Watch-Items: ApiFailure status precedence diverges only for malformed responses; `apps/front` is body `status`-first. | Unit | Pass an error object with a parseable RFC 7807 body that has no `status` and a `responseStatusCode` of `418`; assert `toApiFailure(error).status` is `418`. |
| `api_failure.defaults_to_500_when_no_status_is_usable` | Status defaults to `500` when neither problem body nor transport exposes a usable status. | Known Divergences / Phase-1 Watch-Items: ApiFailure status precedence diverges only for malformed responses; `apps/front` is body `status`-first. | Unit | Pass the M0.3 captured malformed/no-status error shape; assert `toApiFailure(error).status` is `500` and the failure kind matches the current-app baseline. |
| `query_client.logout_is_401_only_for_queries` | Query-cache global auth handling calls logout only for `401`. | Auth: Logout is `401`-only: `403`, `500`, network failure, timeout, reset, and invalid JSON do not log the user out. | Unit | Invoke the query error handler through a `QueryClient` with `401`, `403`, `500`, network, timeout, reset, invalid JSON, and abort failures; assert only the `401` case calls the auth callback. |
| `query_client.logout_is_401_only_for_mutations` | Mutation-cache global auth handling calls logout only for `401`. | Auth: Logout is `401`-only: `403`, `500`, network failure, timeout, reset, and invalid JSON do not log the user out. | Unit | Invoke mutation failures for `401`, `403`, validation, network, timeout, reset, invalid JSON, and abort; assert a normal `401` calls the auth callback, a `401` with mutation `meta.skipAuthErrorHandler` does NOT call the auth callback, non-401 failures do not call it, and abort stays silent. |

## Log-Redaction Characterization

| Stable spec name | Behavior under test | Parity invariant | Layer | Concrete assertion |
|---|---|---|---|---|
| `security.session_token_not_logged_browser_console` | Session token values never appear in browser-emitted diagnostics. | Auth: Session token values are never written to browser or container logs. | Playwright-e2e | Use a unique sentinel token/session value containing JSON- and URL-sensitive characters during login and route faults; collect app/browser-emitted console, page-error, and diagnostic log payloads; assert the raw token plus common URL-encoded and JSON-escaped forms never appear. Do not assert against harness-owned request/response objects that expose protocol headers by design. |
| `security.session_token_not_logged_current_app_process` | Session token values never appear in current-app process output or browser diagnostics. | Cross-Cutting: Session tokens are redacted from deployed logs and browser diagnostic channels. | Playwright-e2e | Run the #693 current-app capture around the `apps/front` process stdout/stderr and browser diagnostics; exercise login, staff-users load, forced `401`, forced `403`, and network fault; assert the raw sentinel token plus common URL-encoded and JSON-escaped forms are absent from every captured current-app sink. |
| `security.session_token_header_redacted_in_api_failure_debug` | Query/mutation debug logging does not leak request headers or raw token values into browser diagnostics. | Auth: Session token values are never written to browser or container logs. | Unit | In dev-mode error handling, pass failures containing headers/request metadata with `X-Session-Token`; assert browser logger payloads omit or redact the raw sentinel token plus common URL-encoded and JSON-escaped forms. |

## URL-State Characterization

These rows map to the `URL State` invariant group in `parity-contract.md`, with
exact captured values supplied by M0.3. The `q` filtering behavior is also
backed by the existing staff-users search invariant.
Sort/cursor round-trip plus stale-`cursor` reset on search change are tracked by
the second URL State parity-contract row as characterization backlog, not in the
first gate.

| Stable spec name | Behavior under test | Parity invariant | Layer | Concrete assertion |
|---|---|---|---|---|
| `table_url_state.round_trips_search_q_and_size` | Staff table URL state preserves search text and page size as current-app request state. | URL State: Staff-users table URL state round-trips `q` (search) and `size` (page size) and rehydrates those visible controls on load. | Playwright-e2e | Navigate to the M0.3 staff-users URL containing `q` and `size`; assert the table controller sends the captured `q` and page-size/limit value to the method-specific `GET /staff/users`, the visible search and size controls rehydrate, and the filtered rows match the M0.3 baseline. |
| `table_url_state.search_updates_q_request_and_url` | Search changes update the URL-backed `q` state before the next app-data request. | URL State: Staff-users table URL state round-trips `q` (search) and `size` (page size) and rehydrates those visible controls on load. | Playwright-e2e | Type the M0.3 search term; assert the next method-specific `GET /staff/users` includes the new `q`, the URL reflects the current-app `q` shape, and the rendered rows match the filtered seeded-list baseline. |
| `table_url_state.page_size_round_trip` | Page size persists through current-app URL state and request variables. | URL State: Staff-users table URL state round-trips `q` (search) and `size` (page size) and rehydrates those visible controls on load. | Playwright-e2e | Change table page size to the M0.3-supported value; assert URL `size` changes, reload preserves the selected visible size control, and the next method-specific `GET /staff/users` uses the same captured page-size/limit value without introducing a duplicate app-data request. |

## Staff-Users Characterization

| Stable spec name | Behavior under test | Parity invariant | Layer | Concrete assertion |
|---|---|---|---|---|
| `staff_users.list.renders_seeded_rows` | Staff-users list renders seeded rows from the current API. | Staff-Users List: The staff-users page renders seeded staff rows, including `staff-admin@example.com`. | Playwright-e2e | After seeded staff login, open the M0.3 staff-users route; assert `staff-admin@example.com`, `owner@publyapp.local`, and `staff-user@example.com` are visible in the current-app row/cell shape. |
| `staff_users.list.matches_current_column_shape` | The table shape matches current app: columns are `Name`, `Level`, `Status`, and `Actions`, with email rendered as secondary text inside the first name/user cell. | Known Divergences / Phase-1 Watch-Items: Current `apps/front` staff-users table diverges from the spike's explicit column shape: email is secondary text in the name cell, not a standalone email column. | Playwright-e2e | Assert the visible headers/cells match M0.3 exactly: there is no standalone email column, the `Name` cell includes email secondary text, `Level` and `Status` columns render, and row actions are present. |
| `staff_users.list.search_filters_seeded_rows` | Searching filters to matching seeded rows. | Staff-Users List: Search filters the list to matching rows and clearing search restores the seeded list. | Playwright-e2e | Type `staff-admin` in the current search control; assert the next rendered table contains `staff-admin@example.com` and no non-matching seeded staff-user rows. |
| `staff_users.list.search_clear_restores_seeded_rows` | Clearing search restores the seeded list. | Staff-Users List: Search filters the list to matching rows and clearing search restores the seeded list. | Playwright-e2e | Clear the search control; assert the URL/query state returns to the M0.3 empty-search form and all seeded staff rows are visible again. |
| `staff_users.list.clean_load_single_get` | A clean staff-users load issues exactly one app-data `GET /staff/users`. | Staff-Users List: A clean staff-users load issues exactly one `GET /staff/users` application data request; Cross-Cutting: Staff-users route-count checks are method-aware, so CORS `OPTIONS` is not mistaken for duplicate app data. | Playwright-e2e | Count method-specific network requests from first navigation to settled table; assert exactly one `GET /staff/users`, ignoring `OPTIONS`, assets, auth bootstrap, and preflight traffic. |
| `staff_users.list.search_single_get_per_committed_query` | Search emits one app-data GET per committed/debounced query value. | Staff-Users List: Search filters the list to matching rows and clearing search restores the seeded list; Cross-Cutting: Staff-users route-count checks are method-aware, so CORS `OPTIONS` is not mistaken for duplicate app data. | Playwright-e2e | Type the M0.3 search term and wait for debounce/settle; assert one method-specific `GET /staff/users` for the committed `q` value and no duplicate browser/loader fetch. |

## Backlog Carry-Forward

These are explicitly not part of the initial Phase-2 fan-out gate. They remain
in the first design list so the #694 design has named coverage ready when #693
infrastructure lands.

These rows are design inventory, NOT part of the Phase-1 acceptance/gate
coverage.

| Stable spec name | Behavior under test | Parity invariant | Layer | Concrete assertion |
|---|---|---|---|---|
| `invite.entry_navigates_to_staff_invitations_new` | Staff-users invite affordance follows current app behavior. | Known Divergences / Phase-1 Watch-Items: Current `apps/front` invite UX diverges from the spike: the current app links from staff-users to `/staff/invitations/new`, while the spike opens an on-page invite dialog. | Playwright-e2e | From staff-users, activate `Invite users`; assert current `apps/front` navigates to `/staff/invitations/new` rather than opening an on-page dialog. |
| `invite.invalid_email_uses_localized_interzod_message_en_fr` | Invalid invite email is rejected through RHF + Zod/InterZod in English and French. | Invite Dialog: Invalid email is rejected through the form validation stack and surfaces a localized InterZod/Zod message. | Playwright-e2e | Enter `not-an-email` under English and French locale baselines; assert each visible validation message exactly matches the M0.3 captured text. |
| `theme.dark_mode_persists_after_reload` | Dark-mode toggle changes document theme and persists. | Theme: The dark-mode toggle changes the actual document theme state; Theme: The selected theme persists across reload. | Playwright-e2e | Toggle dark mode from the current settings surface; assert document theme state, `publyapp:color-scheme`, and post-reload state match M0.3. |
| `i18n.cookie_locale_controls_ssr_and_validation` | Locale cookie controls SSR language and validation messages. | I18n: The configured language renders localized app strings; I18n: InterZod validation messages resolve through the active locale. | Playwright-e2e | Set `publyapp-locale=fr`, load `/login` and invite validation; assert `<html lang>`, visible localized copy, and invalid-email message match M0.3. |

## Phase-2 Gate

When #693 and #694 are in place, the first green characterization suite from
these sections becomes the Phase-2 fan-out gate:

- Auth Characterization.
- ApiFailure And Query Handling.
- Log-Redaction Characterization.
- URL-State Characterization.
- Staff-Users Characterization.

- `apps/front` must stay green against this suite while front-2 is built.
- `apps/front-2` must pass the same parity assertions before replacing or
  expanding a migrated surface.
- Backlog Carry-Forward specs are excluded backlog until a later
  migration task explicitly promotes them into the gate.
- Known current-app divergences from the spike are locked unless a later
  migration decision explicitly records an intentional divergence in
  `docs/front-2-migration/parity-contract.md`.
