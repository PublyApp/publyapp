# Current-App Characterization Suite Design

This design is the implementation target for the `apps/front` characterization
suite used by the front-2 migration. The suite pins current `apps/front`
behavior as the golden reference before Phase 2 starts moving surfaces into
`apps/front-2`.

## Status

- The first unit layer is already landed on `develop`: `apps/front` has Vitest,
  a `front-unit` pull-request workflow, ApiFailure precedence specs, and
  QueryClient 401-only logout specs.
- #731 owns the remaining build work: the dev diagnostic redaction unit spec,
  the compose-backed Playwright e2e harness, and the e2e specs listed in
  `characterization-plan.md`.
- The Phase-2 fan-out gate is not ready until the e2e suite is green on
  `develop`. The gate wiring belongs to #725 after that.

## Test Layers

Use two layers only:

- Unit: Vitest, node by default, jsdom only by per-file docblock. Use this for
  ApiFailure parsing, QueryClient auth handling, dev diagnostics, and any
  behavior that can be driven without HTTP or browser navigation.
- E2E: Playwright against a fresh Docker compose stack. Use this for login
  redirects, auth-surface behavior, URL state, staff-users rendering/search,
  request counts, and log-leak capture.

Do not add MSW. The old "MSW-integration" labels in earlier planning do not map
to a useful third layer:

- ApiFailure and QueryClient behaviors are pure in-process logic. Mocking HTTP
  would add a fake boundary the code under test does not cross.
- Redirects, logout navigation, route state, table rendering, and log capture
  are browser flows. They need React Router, the browser, and the current app
  runtime. Playwright can force fault responses with `page.route(...)` while the
  happy paths keep using the real seeded API.
- The repo already has the proven front-2 pattern: Vitest for in-process tests
  and Playwright on compose for browser flows.

## Vitest Unit Layer

The unit layer mirrors the front-2 Vitest shape:

- `environment: "node"` by default.
- `// @vitest-environment jsdom` only for files that need DOM/browser globals.
- Exact-pinned test dependencies, matching front-2 versions when a dependency
  is shared.
- No app render harness unless a specific future unit test needs it.

The first merged unit slice covers:

- `api_failure.problem_body_status_wins_over_transport_status`
- `api_failure.validation_body_status_wins_over_transport_status`
- `api_failure.transport_status_used_when_body_status_missing`
- `api_failure.defaults_to_500_when_no_status_is_usable`
- `query_client.logout_is_401_only_for_queries`
- `query_client.logout_is_401_only_for_mutations`

The dev diagnostic redaction unit spec is still required before #725. It must
stay unit-level because the relevant logger path is dev-mode browser code and
cannot be proven reliably by container log capture alone.

## Playwright E2E Harness

`apps/front` gets its own e2e harness instead of sharing the front-2 compose
file. The current app has a different server shape, so it needs its own
`apps/front/Dockerfile`, `apps/front/docker-compose.test.yml`, and
`apps/front/playwright.config.ts`.

The first harness should be minimal:

- `postgres`
- `migrate`
- `api`
- `front`

Do not add Traefik, toxiproxy, or a request-counter sidecar for the first gate.
The initial specs can count app-data requests in Playwright with
`page.on("request", ...)`, force 401/403 responses with `page.route(...)`, and
read current-app process output with `docker compose logs front`.

Run e2e against a fresh stack. Reused compose stacks have already shown locale
and axe flake risk, so the verification flow for this suite is:

1. `docker compose -f apps/front/docker-compose.test.yml down -v`
2. `docker compose -f apps/front/docker-compose.test.yml up -d --build`
3. `pnpm --filter front exec playwright test`
4. `docker compose -f apps/front/docker-compose.test.yml down -v`

Only one Docker/compose e2e stack should run at a time on the host.

## Selector Policy

Do not add `data-testid` attributes to `apps/front` product code for this suite.
The current app has no testids today, and this characterization suite should not
change product markup just to make tests easier.

Use observable behavior selectors:

- roles and accessible names where available
- visible text for stable seeded rows and table headers
- documented current-app form selectors from the M0.3 baseline, such as
  `input[name="email"]`, `input[name="password"]`, and the `Sign in` submit
  button

If one future assertion is impossible without a testid, make that a separate
product-code decision. Do not backfill testids speculatively.

## First-Gate Spec Mapping

`characterization-plan.md` is the source of truth for the spec inventory. The
layer mapping is:

- ApiFailure precedence: Unit.
- QueryClient 401-only query and mutation handling: Unit.
- Valid login, invalid login, auth-surface 401, authed query 401, and authed
  403: Playwright e2e.
- URL `q` round-trip and search request shape: Playwright e2e.
- Staff-users seeded rows, column shape, search/filter, and method-aware request
  counts: Playwright e2e.
- Browser console and current-app process log redaction: Playwright e2e.

Backlog carry-forward specs remain named but excluded from the first gate until
a later migration task promotes them:

- invite-route validation and localized messages
- dark-mode persistence
- locale cookie and validation behavior
- `size`, sort, cursor, and stale-cursor URL-state behavior
- CSP/TLS/proxy checks that require a larger harness

## Green Against M0.3

"Green against M0.3" means the suite asserts the captured current-app baseline
from `parity-contract.md`:

- seeded staff login lands on `/staff`
- the staff-users surface lives at `/staff/staff-users`
- seeded rows include `staff-admin@example.com`, `owner@publyapp.local`, and
  `staff-user@example.com`
- staff-users columns are `Name`, `Level`, `Status`, and `Actions`, with email
  as secondary text in the `Name` cell
- search writes and rehydrates `?q=staff-admin`
- forced authenticated app-data `401` logs out once and reaches `/login`
- forced authenticated app-data `403` does not log out
- invalid credentials stay on `/login` and render the current localized problem
- sentinel session-token values are absent from browser diagnostics and
  current-app process logs

The suite protects `apps/front` first. Front-2 Phase 2 can then require a
migrated surface to pass equivalent parity assertions before that surface
replaces current-app behavior.

## CI Shape

The characterization workflow has two jobs over time:

- `front-unit`: pull-request job that runs `pnpm --filter front run test`.
  This already exists and is the fast guard for in-process invariants.
- `front-e2e`: compose-backed job added with the e2e harness. It should run
  after building a fresh stack and should upload the Playwright report on
  failure.

Issue #725 should only wire the Phase-2 fan-out gate after #731 lands and both
jobs are green on `develop`. Until then, #725 remains a follow-up gate issue,
not a design or suite-build task.

## Non-Goals

- No MSW dependency.
- No snapshot testing of MUI, Emotion, or material-react-table internals.
- No shared parameterized compose abstraction for `apps/front` and
  `apps/front-2` in the first pass.
- No Traefik, toxiproxy, or request-counter sidecars until a promoted spec
  needs them.
- No full dependency pin migration for existing `apps/front` dependencies.
