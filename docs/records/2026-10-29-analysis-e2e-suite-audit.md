# E2E suite audit — is the 52-spec suite earning its ~11.5 minutes?

Date: 2026-10-29. Type: analysis. Issue: #2260. PR: #2262.

## Why this record exists

After the CI split, the pipeline is no longer bounded by `CI verification` but by the
e2e chain (build images → four shards → cleanup). The owner asked to attack that chain on
the rule the repository already states in
[`docs/guides/e2e-coverage.md`](../../guides/e2e-coverage.md):

> A suite that tries to cover everything becomes slow and flaky, and a flaky suite is
> ignored — which is the same as having no suite.

This record judges all **52** specs under `apps/front/e2e/` against the five criteria in
that guide and against their measured cost, classifies each one, and proposes a `smoke` /
`full` split. It is the analysis that justifies deletions: **no spec is deleted here**, and
nothing is edited to pass. The owner decides.

## The standard used

A spec is **KEEP** only when all five criteria hold in substance:

1. a person can drive a screen;
2. a regression would be silent — a cheaper test does not already catch it;
3. the behaviour crosses a seam (persisted value, read back in a different
   request/route/role, or a server-side guard);
4. it is deterministic;
5. the ticket is yours.

The guide's own exception is honoured: the i18n and public-page smokes stay even where they
do not name a seam, because they cover routing, locale negotiation and middleware at once.

**Criterion 5 is not decidable from the repository.** No spec's author or assignee was
checked against its `@<ticket>` tag; doing so would need the issue history of 52 tickets and
is the owner's call. Every spec is therefore judged on criteria 1–4, and its ticket tag is
recorded so the owner can apply criterion 5. This is a stated limit of the audit, not an
omission — it is repeated in "What could not be judged".

## Method

- **Inventory**: `apps/front/e2e/*.spec.ts` — 52 files, 359 tests across the five Playwright
  projects (`playwright test --list`: 347 in the two CI shard projects, 9 in
  `chromium-hermetic-source`, 3 in `chromium-hermetic-counter`, 1 in `setup`). The four CI
  shards schedule 88 / 96 / 80 / 86 tests.
- **Durations, source A — CI.** Playwright HTML reports are uploaded only when the Playwright
  step fails, so only two artifacts exist in the repository's history:
  `front-e2e-playwright-report-3-of-4` and `-4-of-4` from run
  [40730997374](https://github.com/PublyApp/publyapp/actions/runs/40730997374). Each embeds
  its full report payload (`window.playwrightReportBase64`), which was decoded and parsed for
  per-test `duration`, `outcome` and `projectName`. This yields **CI** durations for the 23
  specs that ran in shards 3 and 4 on 2026-10-28.
- **Durations, source B — local full run.** Shards 1 and 2 uploaded nothing, and no other CI
  run in the last 100 artifacts has a Playwright report at all. To get per-spec numbers for
  those 29 specs, the whole suite was run **serially** (the config's default `workers: 1`)
  against the same `apps/front/docker-compose.test.yml` stack on 2026-10-29, with
  `--reporter=json`, on a 12-core / 61 GiB Linux host, Node v24.19.0, Chromium (Playwright
  1.64.1, chrome-headless 1248). Local numbers are wall clock for one stack and one worker;
  they are **not** a CI prediction and are labelled as local wherever used.
- **Two local runs, deliberately reported.** The first ran against the images already on the
  host, which were built on **2026-09-09** — seven weeks older than the worktree's HEAD. It
  produced 12 failures (8 of them `drawer-form-scroll-geometry`'s mastodon/discord-connect
  drawers, which did not exist in that image) and is **discarded for verdicts**; it is kept
  only because it is the evidence for F6 (the counter project disappeared when other projects
  went red). The images were then rebuilt from HEAD (`docker compose build`, 14 min 39 s), the
  database was recreated, and the second run — the authoritative one — finished **359/359
  green in 17.8 min** of test time. A third, targeted run measured the proposed smoke set on a
  cold stack: **43.1 s**.
- **Mock inventory**: `page.route` / `.route(` call sites per spec, counted mechanically. A
  spec that mocks the endpoint whose semantics it asserts cannot cross the persistence seam;
  that is the single most useful fact in this audit and it is measured, not guessed.
- **CI behaviour sample**: the last 40 `ci.yml` runs were queried through the Actions API and
  their `front-e2e (*/4)` job conclusions tabulated. This is the flakiness evidence — or, as
  it turns out, the absence of it.

## Findings

### F1 — The suite is really two suites, and only one of them is e2e

23 of the 52 specs mock the network with `page.route`. Several mock the exact endpoint whose
semantics they assert (`staff-tenants` mocks the status filter, `staff-tenant-edit` keeps an
in-memory fake server so the "persisted after reload" assertion reads the mock, not Postgres,
`staff-dashboard-*` mock every endpoint). Those specs cross no seam: the guide's criterion 3
says a pure render — props in, DOM out, same route, same role — is not one, and a mock does
not make it one.

They also pay the most expensive possible price for a component test: a docker stack, image
pull, session bootstrap, and a browser per spec.

### F2 — The expensive half is design measurement, not user journeys

Measured on HEAD, the contrast/geometry family sits at the top: `toast-contrast` 89.0 s for
38 tests, `drawer-form-scroll-geometry` 176.0 s for 40 tests across four viewports,
`staff-tenant-details` 91.6 s for 32 mocked UI tests. (The CI artifact from 2026-10-28 agrees
within ~20 % on the two it measured: 98.8 s and 112.1 s.) These are measurement
harnesses. They prove real engine facts (that is why `focus-ring-cascade` and
`data-table-icon-visibility-guard` are KEEP), but most of them measure computed style on a
single component and belong in the browser-mode Vitest lane the repo already runs for
`drawer-description-contrast`, not behind a docker stack.

`drawer-description-contrast.spec.ts` is the clearest case: the same contract is enforced
twice in the same CI job — once by this Playwright spec against the live stack, and once by
`src/styles/drawer-description-contrast.test.ts` via `pnpm --filter front test:drawer-contrast`
in the shard-4 block. The cheaper test is already there and is the primary; the Playwright
spec is the duplicate.

### F3 — The seams that actually justify e2e are a minority

The specs that write through the real API and read back across a route, role or request are
`tenant-post-image`, `tenant-posts-publish-now`, `tenant-portal-picker`,
`staff-profile-edit-flow`, `staff-profiles`, `table` (the API's own 422 and the seeded reads),
`staff-user-details` — all KEEP except `tenant-posts-publish-now`, which is FIX-FLAKY — plus the
security/auth/public family (`ssr-auth-shell`, `auth-error`,
`csp`, `log-leak`, `seo`, `i18n`, `i18n-namespaces`, `cold-boot-stability`,
`auth-redirect-guard`, `auth-screens`, `logout`, `locale-switch`, `tab-sync`) and the
hermetic real-browser proofs (`breadcrumb-entity-name-truncation`, `focus-ring-cascade`,
`data-table-icon-visibility-guard`) and the browser-lifecycle spec
`tab-refocus-stability`. That is 24 KEEP specs, and the hermetic three need no stack at all.

### F4 — The suite is *not* currently flaky in CI, and the audit says so with a number

Last 40 `ci.yml` runs: 37 ran the e2e chain (148 `front-e2e` shard jobs). **Two jobs failed,
both in one run**, and the four failing tests were all upload paths (`staff-tenant-edit` logo
×2, `staff-tenant-create` logo, `tenant-post-image` attach) on the Dependabot bump of
`@microsoft/kiota-serialization-multipart`. That is a real regression caught by the suite — a
good day, not a flake.

So the FIX-FLAKY list below does **not** rest on CI failure rates (there are none to measure).
It rests on the specs whose own source documents a race that was worked around rather than
removed: a 120 s reload loop against a shared worker, an ordering dependency that only holds
because Playwright runs other projects first, a 60 s budget raised to clear a load flake, a
visibility wait widened after a trace showed a chunk race, an auth-gate query mocked because
the button went inert under load. Those are recorded in each file, quoted in the table.

### F5 — Tags and docs have drifted, and a grep-based split would be unsafe

- `docs/guides/e2e-tags.md` inventories **43** specs, not 52; nine are missing, and its
  vocabulary table omits `@staff-jobs` even though the guard's `KNOWN_DOMAINS` includes it.
- Two files carry top-level `test()` calls **outside any `test.describe`**:
  `auth-screens.spec.ts` (the five auth-layout tests, lines 31–42) and `tab-sync.spec.ts` (the
  cross-tab theme test, line 33). The tag guard only inspects describes, so those six tests
  carry no domain tag and no ticket, and `--grep @auth` silently excludes them.

Consequence for this proposal: the smoke/full split is expressed as an **explicit file list**,
not as a `--grep` over tags. A grep-based split would drop six tests from every lane without
anyone noticing — the exact failure mode the tag guard exists to prevent, one level down.

### F6 — The counter guard disappears exactly when the run is red

`playwright.config.ts` gives `chromium-hermetic-counter` `dependencies: ['setup', 'chromium',
'chromium-faults']` so the request counts are not polluted by concurrent traffic — and the
config states the cost: "if a test in either dependency project fails, Playwright skips this
project's tests entirely". Measured, not assumed: the first local full run of 2026-10-29 (against a
seven-week-old image, 12 failures) produced **no `request-counter` results at all** (356 of 359
tests), while the three specs in `chromium-hermetic-source`, whose project has no dependency,
ran normally. The clean run the same day (359/359 green) did include them — so the guard is
present exactly when nothing else is red.
The guard that exists to catch a doubled request vanishes on the runs where a doubled request
is most likely to be introduced.

### F7 — Unbounded budgets hide in four specs

`tenant-posts-publish-now` (120 s reload loop), `toast-contrast` (4 s Sonner auto-dismiss
window binds every measurement; 60 s ceiling), `staff-jobs` (60 s toast waits),
`request-counter` (hermetic only because of project ordering). Those are the four specs whose
duration is a function of something other than their assertions.

## Inventory

All durations are from the single HEAD run of 2026-10-29 (359/359 green, one stack, one
worker). Where the CI artifact from 2026-10-28 also measured a spec, the two agree within
~20 %; the CI numbers are quoted in Findings and in "Numbers", not duplicated per row. "Tags"
is what the spec carries today — including the six tests that carry none (F5). The Class
column is the verdict; the classification lists below hold the reasoning that does not fit a
cell.

| Spec | Class | Tags | Tests | Measured | Criterion failed | What it proves |
| --- | --- | --- | ---: | ---: | --- | --- |
| `auth-error.spec.ts` | KEEP | @auth @security @713 | 10 | 37.5 s (local) | — | Toxiproxy-injected connection failure/timeout/500/invalid JSON map to a list error without logout; 401 logs out, 403 does not; 404 view. |
| `auth-redirect-guard.spec.ts` | KEEP | @auth @untracked | 1 | 1.7 s (local) | — | An authenticated cold visit to /login lands in the workspace without the login form. |
| `auth-screens.spec.ts` | KEEP | @auth @806 | 11 | 5.1 s (local) | — | Each auth route renders the standalone auth layout (never the marketing/app shell); garbage tokens land on the shared invalid-link view. |
| `breadcrumb-entity-name-truncation.spec.ts` | KEEP | @shell @973 | 2 | 113.0 s (local) | — | Real compiled CSS actually clips a long breadcrumb entity name and does not clip a short one (plus a CSS-mutation proof). |
| `cold-boot-stability.spec.ts` | KEEP | @auth @untracked | 1 | 2.3 s (local) | — | The raw SSR HTML of an authed reload already contains the neutral shell chrome before any client JS runs. |
| `csp.spec.ts` | KEEP | @public @713 | 3 | 1.3 s (local) | — | CSP header + per-document nonce on every HTML surface, and the browser really blocks a non-nonced script while running a nonced one. |
| `data-table-icon-visibility-guard.spec.ts` | KEEP | @design @1799 | 3 | 2.7 s (local) | — | Five real hiding mechanisms are caught by the shipped guard against real compiled CSS, with a no-false-positive baseline. |
| `design-chrome-fixes.spec.ts` | DEMOTE | @design @806 | 4 | 15.3 s (local) | 3 (and 2) | Computed border/hover/checkbox/popup colours and geometry on live staff routes. |
| `design-handoff-foundation.spec.ts` | DEMOTE | @design @806 | 8 | 16.7 s (local) | 3 (and 2) | Shell/table/confirm-modal/empty-state geometry pinned to the handoff registry (exact px). |
| `design-handoff-staff-profiles.spec.ts` | DEMOTE | @design @staff-profiles @806 | 3 | 8.0 s (local) | 3 (and 2) | Profile list grid/row height and detail identity block geometry per handoff 2g/2h. |
| `drawer-description-contrast.spec.ts` | DEMOTE | @design @1043 | 16 | 34.6 s (local) | 3 (and 2) | Every DrawerDescription consumer clears 4.5:1 in both themes on the live stack. |
| `drawer-form-scroll-geometry.spec.ts` | FIX-FLAKY | @design @990 | 40 | 176.0 s (local) | 4 | Body/footer scroll geometry of every inventoried drawer form at four viewports. |
| `field-validation.spec.ts` | DEMOTE | @design @721 | 3 | 10.6 s (local) | 3 (and 2) | InterZod FR/EN messages clear on valid input; shared controls match the Gray UI outline; axe finds no violation. |
| `focus-ring-cascade.spec.ts` | KEEP | @design @823 | 4 | 1.6 s (local) | — | Every shipping focusable primitive paints a >=3:1 focus-visible indicator under the real compiled CSS, with three mutation proofs. |
| `form-action-bar-clearance.spec.ts` | DEMOTE | @design @806 | 4 | 8.7 s (local) | 3 (and 2) | The pinned form action bar is opaque and the last field scrolls clear of it at a short viewport. |
| `gray-ui-screenshot-capture.spec.ts` | DELETE | @design @shell @untracked | 6 | 15.9 s (local) | 2 + 3 | Nothing. The file says it captures reference screenshots for manual review and compares no pixels. |
| `i18n-namespaces.spec.ts` | KEEP | @i18n @909 | 3 | 0.3 s (local) | — | French auth SSR contains French copy with no English fallback; concurrent SSR requests do not leak locale resources; hydration does not flash English. |
| `i18n.spec.ts` | KEEP | @i18n @713 | 2 | 0.6 s (local) | — | Locale cookie decides `html lang` and the rendered copy; an unsupported locale falls back to English. |
| `locale-switch.spec.ts` | KEEP | @i18n @806 | 2 | 4.5 s (local) | — | Switching locale in the user menu persists across reload and flips every other tab without a reload. |
| `log-leak.spec.ts` | KEEP | @security @733 | 2 | 3.8 s (local) | — | A rejected session token is absent from every deployed container log sink and from the browser console, in raw/encoded/JSON-escaped form. |
| `logout.spec.ts` | KEEP | @auth @806 | 1 | 2.5 s (local) | — | User-menu logout clears the session and returns to the login form. |
| `parity-happy-path.spec.ts` | DELETE | @staff-dashboard @723 | 8 | 13.6 s (local) | 2 + 3 | Parity with the retired apps/old-front: login, search, invite, theme, locale — every assertion is duplicated by table/locale-switch/staff-invitations or mocked. |
| `profile-icon-picker-pin-contrast.spec.ts` | DEMOTE | @design @staff-profiles @992 | 4 | 8.9 s (local) | 3 (and 2) | The pencil pin on the profile icon picker clears 3:1 in both themes, plus three mutation proofs. |
| `profile-icon-picker-pin-geometry.spec.ts` | DEMOTE | @design @staff-profiles @992 | 4 | 8.9 s (local) | 3 (and 2) | The pin overhangs the tile, is not clipped, does not collide at desktop and narrow widths (plus mutations). |
| `request-counter.spec.ts` | FIX-FLAKY | @security @806 | 3 | 8.2 s (local) | 4 | Exactly one GET /staff/invitations on first load, none on a fresh revisit, one more per status filter. |
| `row-actions-centering.spec.ts` | DEMOTE | @shell @806 | 5 | 11.8 s (local) | 3 (and 2) | The row-actions trigger centre sits within 1px of its 40px cell centre on four tables. |
| `search-input-native-cancel-suppression.spec.ts` | DELETE | @shell @975 | 1 | 2.2 s (local) | 2 + 3 | A search field has one accessible clear control that empties and refocuses the field. |
| `seo.spec.ts` | KEEP | @public @713 | 3 | 0.1 s (local) | — | Canonical/OG/robots/hreflang/sitemap metadata on public routes, and noindex on an unknown route. |
| `shell.spec.ts` | DEMOTE | @shell @713 | 18 | 57.0 s (local) | 3 (and 2) | Landing/authed shell rendering, rail+panel dimensions, and the persisted sidebar-panel preference across routes and reloads. |
| `smoke.spec.ts` | KEEP | @public @733 | 1 | 0.3 s (local) | — | The deployed compose stack serves `/` and the landing hero renders. |
| `social-accounts-integrations.spec.ts` | DEMOTE | @tenant-workspace @642 | 1 | 4.5 s (local) | 3 (and 2) | The connect dialog posts and the new account appears in the list. |
| `ssr-auth-shell.spec.ts` | KEEP | @security @997 | 29 | 88.0 s (local) | — | SSR never serves authed chrome from an unvalidated cookie, junk cookies get byte-identical neutral output, a genuine session cold-loads without a hydration error, retry recovers. |
| `staff-dashboard-activity.spec.ts` | DEMOTE | @staff-dashboard @818 | 3 | 3.4 s (local) | 3 (and 2) | The activity feed maps a mocked audit-log row and links to the full log; empty state is honest; the request asks for limit=8. |
| `staff-dashboard-reports.spec.ts` | DEMOTE | @staff-dashboard @818 | 3 | 3.7 s (local) | 3 (and 2) | The report card downloads the audit-log export with format=csv/json; the analytics placeholder is honest. |
| `staff-invitations.spec.ts` | DEMOTE | @staff-invitations @742 | 5 | 12.1 s (local) | 3 (and 2) | Invitation list columns/timing values, status filter reset, empty state, invite navigation, one deterministic error toast. |
| `staff-jobs.spec.ts` | FIX-FLAKY | @staff-jobs @1454 | 2 | 5.7 s (local) | 4 | Queue -> dead-letter requeue -> system-jobs trigger, plus a localized 409 toast that keeps the trigger enabled. |
| `staff-profile-edit-flow.spec.ts` | KEEP | @staff-profiles @819 | 3 | 10.2 s (local) | — | Edit name/description -> PATCH -> reload shows the persisted values; a dirty draft blocks navigation and is really discarded. |
| `staff-profiles.spec.ts` | KEEP | @staff-profiles @744 | 4 | 11.5 s (local) | — | Seeded profiles render with the honest 4-column grid; search narrows the API result set and clearing restores it; table never overflows at 768/390. |
| `staff-tenant-create.spec.ts` | DEMOTE | @staff-tenants @806 | 9 | 26.3 s (local) | 3 (and 2) | Slug field, owners section, live preview counts, confirm summary, logo upload in the create body. |
| `staff-tenant-details.spec.ts` | DEMOTE | @staff-tenants @806 | 32 | 91.6 s (local) | 3 (and 2) | 24 UI behaviours on one mocked tenant: tabs, stat cards, filters, card grid, selection bars, CSV downloads, drawers, invite flows, legacy redirects. |
| `staff-tenant-edit.spec.ts` | DEMOTE | @staff-tenants @806 | 9 | 30.7 s (local) | 3 (and 2) | Edit legal name/billing email, dirty-guard, logo upload preview, metadata stacking — all against an in-memory fake server. |
| `staff-tenants.spec.ts` | DEMOTE | @staff-tenants @806 | 9 | 26.2 s (local) | 3 (and 2) | Status filtering via panel and toolbar, selection/bulk-suspend, hashed logo fallback, column widths, responsive overflow at 768/390. |
| `staff-user-details.spec.ts` | KEEP | @staff-users @806 | 1 | 2.8 s (local) | — | Tabs are real routes: deep-link into `/permissions` survives a hard load, Overview click rewrites the URL, back returns. |
| `table-scroll-ownership.spec.ts` | DEMOTE | @shell @806 | 1 | 2.6 s (local) | 3 (and 2) | The shell body does not scroll while the table container does, with toolbar/footer in view. |
| `table.spec.ts` | KEEP | @shell @staff-users @720 | 14 | 23.0 s (local) | — | Seeded rows + search (incl. NO_MATCH), sort, cursor pagination, the API's own 422 on an oversized limit, axe, keyboard row navigation, responsive footer. |
| `tab-refocus-stability.spec.ts` | KEEP | @auth @806 | 6 | 24.4 s (local) | — | A stale query refetches on refocus while a fresh one does not, and refocus never blanks the table or refetches the redirect-code query. |
| `tab-sync.spec.ts` | KEEP | @auth @806 | 3 | 10.7 s (local) | — | Logout in one tab bounces every other authed tab to /login; login on a parked /login tab moves it into the workspace. |
| `tenant-portal-picker.spec.ts` | KEEP | @staff-tenants @1611 @806 | 4 | 8.3 s (local) | — | Single/multi-tenant users resolve the picker correctly and the all-tenants-deleted journey explains itself (fixture created and deleted through the real API). |
| `tenant-post-image.spec.ts` | KEEP | @uploads @639 | 2 | 6.3 s (local) | — | Draft + deferred image + alt text -> list -> edit page shows all three; a rejected attach keeps the saved draft and names the cause. |
| `tenant-posts-drafts.spec.ts` | DELETE | @tenant-workspace @638 | 3 | 5.9 s (local) | 2 + 3 | The drafts page renders, the drawer opens, three fields are visible, and an "empty" page still shows a table. |
| `tenant-posts-publish-now.spec.ts` | FIX-FLAKY | @tenant-workspace @645 | 1 | 3.1 s (local) | 4 | Publish-now -> worker publishes through the fake provider -> the history row shows exactly one bsky.app link bound to the composed body. |
| `toast-contrast.spec.ts` | FIX-FLAKY | @design @1078 | 38 | 89.0 s (local) | 4 | 38 browser measurements of the real Sonner DOM/pixels against WCAG floors in two themes and two viewports, plus ~25 paint-model mutation proofs. |

## Classification

| Class | Specs | Share |
| --- | ---: | ---: |
| KEEP | 24 | 46 % |
| DEMOTE | 19 | 37 % |
| FIX-FLAKY | 5 | 10 % |
| DELETE | 4 | 8 % |
| **Total** | **52** | |

### KEEP (24 specs, 6.0 min of test time)

Grouped by the seam they actually cross:

- **Security and auth lifecycle (8)**: `ssr-auth-shell.spec.ts`, `auth-error.spec.ts`, `log-leak.spec.ts`, `cold-boot-stability.spec.ts`, `auth-redirect-guard.spec.ts`, `auth-screens.spec.ts`, `logout.spec.ts`, `tab-sync.spec.ts`
- **Public / i18n exception from the guide (6)**: `smoke.spec.ts`, `seo.spec.ts`, `csp.spec.ts`, `i18n.spec.ts`, `i18n-namespaces.spec.ts`, `locale-switch.spec.ts`
- **Real write → read seam through the API (6)**: `tenant-post-image.spec.ts`, `tenant-portal-picker.spec.ts`, `staff-profile-edit-flow.spec.ts`, `staff-profiles.spec.ts`, `table.spec.ts`, `staff-user-details.spec.ts`
- **Real-browser engine facts, hermetic — no stack (3)**: `breadcrumb-entity-name-truncation.spec.ts`, `focus-ring-cascade.spec.ts`, `data-table-icon-visibility-guard.spec.ts`
- **Browser lifecycle / network behaviour (1)**: `tab-refocus-stability.spec.ts`

### DELETE (4 specs, 0.6 min of test time)

A DELETE asserts nothing a unit test does not, or asserts implementation detail.

- `gray-ui-screenshot-capture.spec.ts` — 15.9 s — Six full page drives that assert only that the page rendered; a screenshot script, not a test. **Cheaper:** (none needed — the screenshots are the deliverable, and no baseline is committed).
- `parity-happy-path.spec.ts` — 13.6 s — `apps/old-front` was retired on 2026-08-22; the parity premise died with it. **Cheaper:** `table.spec.ts`, `locale-switch.spec.ts`, `staff-invitations.spec.ts`, plus component tests for the invite form.
- `tenant-posts-drafts.spec.ts` — 5.9 s — No data written or read; the empty-state test asserts the table is visible "regardless of data state". **Cheaper:** Component test of the drafts page.
- `search-input-native-cancel-suppression.spec.ts` — 2.2 s — The file's own docstring proves the thing it exists for (native cancel-button suppression) is unobservable on this platform; what remains is component behaviour. **Cheaper:** `src/components/ui/search-input.test.tsx` (jsdom).

### DEMOTE (19 specs, 6.4 min of test time)

A DEMOTE's assertion is worth keeping; it is available cheaper. The cheaper test is named.

- `staff-tenant-details.spec.ts` — 91.6 s — Largest mocked surface in the suite (32 tests, 1411 lines); nothing persisted, nothing read across roles. **Cheaper:** Component tests per tab with the existing mock fixtures.
- `shell.spec.ts` — 57.0 s — 18 tests, mostly chrome and one localStorage preference; the panel-preference matrix is the clearest component-test target. **Cheaper:** Browser-mode component tests over the shell + ui-store; keep `renders the landing page`, `theme toggle persists` and the `/staff/` redirect as a smoke-sized shell test.
- `drawer-description-contrast.spec.ts` — 34.6 s — The same contract is already enforced by a cheaper Vitest+Chromium test in the e2e lane's shard-4 block — this spec is the duplicate, not the primary. **Cheaper:** `src/styles/drawer-description-contrast.test.ts` (already run by `pnpm --filter front test:drawer-contrast`).
- `staff-tenant-edit.spec.ts` — 30.7 s — `mockTenantEdit` keeps a mutable server-side copy, so the "persisted after reload" assertion reads the mock, not Postgres — it is a mocked round-trip with a real reload, not a seam. **Cheaper:** Component test of the edit form with the same mutable fake client; the persistence half belongs in staff-profile-edit-flow (real PATCH) or a new real-tenant PATCH test.
- `staff-tenant-create.spec.ts` — 26.3 s — POST is mocked; the only real navigation is to a mocked detail route. **Cheaper:** Component test of the create-tenant form with a mocked client.
- `staff-tenants.spec.ts` — 26.2 s — The list endpoint is fully mocked, including the filter semantics the spec asserts. **Cheaper:** Component test of the tenants table with the existing mock fixture.
- `design-handoff-foundation.spec.ts` — 16.7 s — Pins design constants; partially duplicates `shell.spec.ts`. Fails criterion 3 (same route/role) and criterion 2 (a component render catches it). **Cheaper:** Hermetic `chromium-hermetic-source` spec over the real compiled CSS + components, like `breadcrumb-entity-name-truncation`.
- `design-chrome-fixes.spec.ts` — 15.3 s — Pure cascade/computed-style assertions on one route; no seam crossed. **Cheaper:** `src/components/ui/*` browser-mode test (the `test:drawer-contrast` Vitest+Chromium pattern).
- `staff-invitations.spec.ts` — 12.1 s — All data is a `page.route` mock; five DOM assertions. **Cheaper:** Component test of the invitations list with a seeded fixture (the payload is already a literal).
- `row-actions-centering.spec.ts` — 11.8 s — Five copies of one geometry assertion; the fourth route's mock is the only variable. **Cheaper:** Browser-mode component test of the table row-actions cell.
- `field-validation.spec.ts` — 10.6 s — Route is a design showcase; component test already covers the message contract. **Cheaper:** `src/routes/field-validation.test.tsx` (already exists) + the design-system guard.
- `profile-icon-picker-pin-contrast.spec.ts` — 8.9 s — Computed colours on one component; the mutation proofs move with it. **Cheaper:** Browser-mode Vitest over `profile-icon-picker` components (the `test:drawer-contrast` pattern).
- `profile-icon-picker-pin-geometry.spec.ts` — 8.9 s — Same family. **Cheaper:** Browser-mode Vitest over `profile-icon-picker` components.
- `form-action-bar-clearance.spec.ts` — 8.7 s — Two components, one geometry fact; no seam. **Cheaper:** Browser-mode component test of the form action bar.
- `design-handoff-staff-profiles.spec.ts` — 8.0 s — Same family as design-handoff-foundation. **Cheaper:** Hermetic source spec, or a browser-mode component test of the profile table/detail.
- `social-accounts-integrations.spec.ts` — 4.5 s — Both endpoints are `page.route` mocks; nothing is persisted and nothing is read across a seam. **Cheaper:** Component test of the integrations surface with a mocked client.
- `staff-dashboard-reports.spec.ts` — 3.7 s — Export endpoint mocked; `download.suggestedFilename()` is the only non-DOM assertion. **Cheaper:** Component test of the reports panel with a mocked client.
- `staff-dashboard-activity.spec.ts` — 3.4 s — Every endpoint mocked; assertions are wiring, not persistence. **Cheaper:** Component test of the activity feed with a mocked client.
- `table-scroll-ownership.spec.ts` — 2.6 s — Layout fact on one component; the fixture is synthetic either way. **Cheaper:** Browser-mode component test with the same 40-row fixture.

### FIX-FLAKY (5 specs, 4.7 min of test time)

A FIX-FLAKY spec is not deterministic today, evidenced by its own source — not by a failure rate.

- `drawer-form-scroll-geometry.spec.ts` — 176.0 s — In-file record of a local flake papered over with a 25s visibility wait; 40 tests × 4 viewports is the single largest block. **Cheaper:** Browser-mode Vitest over the real drawer components.
- `toast-contrast.spec.ts` — 89.0 s — In-file record of the round-13 load flake (19.9-24.0s under contention, 60s timeout) and of the 4s Sonner auto-dismiss window that binds every measurement. **Cheaper:** Browser-mode Vitest over the toast fixture (same measurement helper, no docker stack).
- `request-counter.spec.ts` — 8.2 s — Hermetic only because Playwright runs `chromium`/`chromium-faults` to completion first, and CI re-runs setup with `--no-deps`; the file states the marker hook is not the isolation mechanism.
- `staff-jobs.spec.ts` — 5.7 s — In-file record: the Requeue/Trigger button went inert under a lagging auth-scope query and "no toast-timeout widening fixed" it; determinism now depends on a mocked auth gate and 60s toast waits.
- `tenant-posts-publish-now.spec.ts` — 3.1 s — Reload loop up to 120s against a shared single-threaded worker (documented 5.3-12.6s latency); the only test whose duration is worker load.


## Proposed CI shape

Two lanes, one mechanism: an explicit spec list passed to the existing
`playwright test` command. No new tag is introduced (the vocabulary in
`docs/guides/e2e-tags.md` is closed, and F5 shows a grep split would drop six untagged
tests); no new Playwright project is added, so nothing is duplicated for contributors who
already run `pnpm --filter front exec playwright test`.

### `smoke` — every PR, one shard, ≤ 3 min

```bash
pnpm --filter front exec playwright test \
  e2e/smoke.spec.ts e2e/i18n.spec.ts e2e/i18n-namespaces.spec.ts e2e/seo.spec.ts \
  e2e/csp.spec.ts e2e/auth-screens.spec.ts e2e/auth-redirect-guard.spec.ts \
  e2e/logout.spec.ts e2e/cold-boot-stability.spec.ts e2e/staff-user-details.spec.ts \
  e2e/staff-profile-edit-flow.spec.ts e2e/tenant-post-image.spec.ts
```

Why these twelve:

- `smoke` is the literal "the stack serves the front" probe — if it fails, nothing else is
  worth running.
- `i18n`, `i18n-namespaces`, `seo`, `csp` are the guide's named public/i18n exception plus the
  two server-header contracts that no component test can observe. All are request- or
  goto-only and cost cents.
- `auth-screens`, `auth-redirect-guard`, `logout` cover the auth surface, the auth-state
  redirect and the logout lifecycle — the three places a session regression is silent.
- `cold-boot-stability` reads the raw SSR body, so it fails if the server stops shipping the
  neutral chrome even when every DOM test stays green.
- `staff-user-details` proves a nested tab route survives a hard load — a server-routing fact
  with one cheap test.
- `staff-profile-edit-flow` is the only real write→reload seam in the staff area: a PATCH
  through the real API, then a fresh document reads the database.
- `tenant-post-image` is the real upload seam, and it is in smoke deliberately: the only CI
  failures in the last 40 runs were upload paths broken by a dependency bump. A smoke lane
  that cannot see the upload path would have missed the one real regression the suite caught.

Deliberately **not** in smoke, with reasons: `ssr-auth-shell` (the security contract, and the
most valuable KEEP — 29 matrix cases cost 88 s, which is most of the 3-minute budget; it is the
first spec to add if the budget grows), `auth-error` (37.5 s of toxiproxy fault injection —
KEEP, full only), `log-leak` (needs the docker log sinks — full only),
`locale-switch` / `tab-sync` (cross-tab timing — KEEP, full only), `tenant-portal-picker`
(creates and deletes a real tenant — full only), `table`, `staff-profiles`, `tab-refocus`
(KEEP, full), `request-counter` (ordering-dependent — FIX-FLAKY first), the three hermetic
`chromium-hermetic-source` specs (they need no stack and should leave the e2e chain for the
front CI lane, which is a cost move, not a spec move), and every DEMOTE/DELETE.

### `full` — merge queue (and nightly)

Everything else. Today that is 51 specs in four shards; once the list is applied it is the 24
KEEP specs in two. Two shapes:

- **Today (nothing deleted):** all 52 specs, 4 shards — unchanged.
- **After the owner applies this list:** the 24 KEEP specs — 4.1 min of test time once the
  three hermetic specs move to front-ci — in **two** shards rather than four. A `full` run over
  KEEP only is the target state.

Nightly is recommended in addition to the merge queue: the merge queue is where a red lane
must block, and the nightly is where a slow, low-probability spec (`log-leak`, the cross-tab
family) can still run without costing every merge.

## Numbers

### Current cost

| What | Measured | Source |
| --- | ---: | --- |
| `e2e-build` job (three images) | 3 min 15 s | CI run 40784317952 |
| shard job fixed overhead: checkout, pnpm, deps, image pull, stack up + health | 1 min 22 s | step timings, shard 1 |
| Playwright step, shard 1 (includes `playwright install chromium`) | 3 min 50 s | step timings, shard 1 |
| slowest shard job, total | 6 min 32 s | shard 4 — it also carries the once-only block |
| **e2e chain, build start → cleanup end** | **10 min 25 s** | same run |
| billable runner minutes per PR (build + 4 shards + cleanup) | ≈ 26.5 min | same run |
| total test time, all 52 specs, one stack, HEAD | 17.7 min (358 tests) | local full run, 359/359 green |
| test time, shard 3 / shard 4 (CI) | 356.6 s / 242.0 s | report artifacts, run 40730997374 |

The shard split is by **test count** (88 / 96 / 80 / 86), not by duration: shard 3 carried
356.6 s and shard 4 242.0 s of test time on the run that produced artifacts — and 90 s of
shard 3's number is three 30 s timeouts from the dependency regression, so the healthy ratio is
roughly 267 s : 212 s. A 47 % spread is invisible in the matrix definition.

The chain in this run is 10 min 25 s; the brief's ~11.5 min matches once queue time between
`e2e-build` and the shards is counted.

### Proposed cost

| Lane | Specs | Tests | Test time | Job wall clock |
| --- | ---: | ---: | ---: | ---: |
| **smoke**, every PR, one runner | 12 | 32 | 33.5 s | **≈ 2.5–3.0 min** (82 s prep + ~60 s tests incl. browser install + 16 s teardown) |
| full, merge queue / nightly, today | 52 | 358 | 17.7 min | 4 shards ≈ 5.5–6.5 min each |
| full, after the list is applied (KEEP only, hermetic three moved to front-ci) | 21 | 106 | 4.1 min | 2 shards ≈ 4 min each, or 1 shard ≈ 5 min |

The smoke lane's test time was measured at **43.1 s** on a cold stack with a cold browser
(33 results including the `setup` login; the HEAD full run charges the same tests
33.5 s inside a warm run). The 3-minute target is therefore bounded by the fixed
job overhead (82 s of checkout/install/stack-up), not by the tests: there is roughly 4× headroom
on the test portion for PRs that grow it.

Billable delta: **≈ 26.5 → 6.5 runner-minutes per PR (−20 min, −75 %)**, at the cost of one full
run per merge (~26 min in the merge queue) plus the nightly. The PR critical path drops from
10 min 25 s to about 6 min 20 s (build 3 min 15 s + smoke 3 min).

## What could not be judged

- **Criterion 5 for all 52 specs.** Ownership is not in the repository. The `@<ticket>` tag is
  recorded per spec in the inventory so the owner can apply it; I did not fetch or interpret
  issue authorship.
- **Per-spec CI durations for every spec.** Playwright reports are uploaded only on failure,
  and only two shard artifacts exist in the repository's history (shards 3–4 of run
  40730997374, covering 23 specs). Shards 1 and 2 have **no** per-spec CI figure anywhere. The
  inventory therefore uses the local HEAD run for all 52, and the two sources are cross-checked
  where they overlap (~20 % agreement). Per-spec *CI* numbers for the other 29 are unknown; the
  chain-level CI numbers in "Numbers" come from job and step timings, which are exact.
- **Whether a DEMOTE's cheaper test already exists.** Where it does, the file is named
  (`field-validation.test.tsx`, `search-input.test.tsx`, `drawer-description-contrast.test.ts`,
  `table.spec.ts` / `locale-switch.spec.ts` as the replacement for `parity-happy-path`).
  Where it does not, the **mechanism** is named (browser-mode Vitest, hermetic source spec,
  component test with the existing mock fixture) — but writing it is follow-up work this
  packet does not do, so the DEMOTE list is "this should move", not "this is already covered".
- **Flakiness rates.** No retry telemetry and no failure-rate measurement exist; `retries: 0`
  and a 40-run sample with two real (non-flake) failures are the only evidence. The FIX-FLAKY
  class therefore rests on each spec's own in-file account of a race it worked around, which
  is quoted rather than inferred. A perfunctory "these five flake" claim would be wrong and is
  not made.
- **Whether `toast-contrast` still flakes.** Its own comment says the round-13 flake was
  closed by a raised budget and reworked measurement, with consecutive green runs. It is
  classified FIX-FLAKY because the race was mitigated, not removed, and because the 4 s
  auto-dismiss window is a live constraint on any future edit — not because it is red today.

## What this packet does not do

- **No spec is deleted.** No file is removed, renamed, skipped, or edited to pass.
- **No coverage contract is weakened.** Every KEEP spec still runs; the split moves cost, not
  assertions. The `full` lane keeps everything the merge queue runs today.
- **No `oxlint-disable`,** no lint or guard suppression, no CI step disabled.
- **No new tag, project, or parallel mechanism.** The proposal is a file list over the existing
  command; the separate commit (if any) is the record itself.
- **No auto-merge, no merge.** The PR carries the record and references the issue checklist.
