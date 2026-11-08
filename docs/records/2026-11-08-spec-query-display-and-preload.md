# Spec — QueryDisplay everywhere (#2341) and data preload on every page (#2340)

Date: 2026-11-08. Owner: Radan. Status: draft, awaiting owner approval.

## 1. Intent

Nothing is broken in the app today. This is a finishing project, with two aims:

- **Perceived speed.** When a user hovers a link, the data of the next page is already being fetched. On
  click, the page appears at once: filled if the data has arrived, otherwise with its loading skeleton.
- **Mechanical enforcement.** Both rules are checked by CI, so no agent or human can forget them. The
  staff dashboard (#2339) proved that a written rule alone is not enough: it dropped `QueryDisplay` and
  nothing noticed.

Owner's picture of "perfect" (2026-11-08): « Je clique dessus et il y a un état de chargement… des loading
skeletons… et que ce soit relativement rapide. » When the data is already there at click time, the page
shows filled, without the skeleton: « c'est très bien même ».

API speed itself (server, database) is out of scope: that is infrastructure.

## 2. Goals, non-goals, anti-goals

Goals:
- Every query render in `apps/front/src` goes through `QueryDisplay`, with **no exception** (owner
  decision 2026-11-08), including small widgets.
- Every route whose page renders query data has a client `loader` that warms that data, with **no
  exception** except a named, reasoned escape comment (owner decision 2026-11-08).
- Both rules are enforced in CI, and the repo is green in the same PRs.

Non-goals:
- Making the API faster.
- SSR data fetching. Authed surfaces stay `ssr: false`, and the loader runs in the browser
  (`AGENTS.md` key rule).
- Changing what any page shows.

Anti-goals (a failure even if it technically works):
- **A loader that blocks navigation.** If the click waits for data before the page changes, the owner's
  picture breaks: the click must show the page (or its skeleton) at once.
- A rule that needs judgement to apply ("is this a page or a widget?"). Agents get that wrong.
- A preload failure that shows an error, a toast or a blank page. The real request at mount explains
  itself.
- Boilerplate so heavy that a loader becomes a page of code. A loader is 2–3 lines.

## 3. Current state (develop, 2026-11-08)

- `apps/front/src/router.tsx:180` sets `defaultPreload: 'intent'`, with the router wired to TanStack
  Query (`setupRouterSsrQueryIntegration`). Hover therefore preloads route **code**. Route **data** is
  warmed only when the route has a `loader`.
- Only one authed route has a loader: `routes/authed/staff/tenants/$tenantId/roles/$roleId.tsx:304`.
  It **awaits** `queryClient.query(...)`, so navigation waits for data and shows `pendingComponent`.
  The other loaders are on anonymous pages (accept-invitation, reset-password, verify-email).
- `apps/front/src/lib/query/route-loader-query-key-guard.test.ts` statically parses the real
  `src/routes/` modules. It checks that a loader warms only query options the route's own components pass
  to `useQuery` (inclusion). It fails loudly on a loader it cannot resolve.
- `packages/lint-ts/src/publy/route-query-preload.ts` (warn) checks a dead mechanism
  (`staticData.preload`; the `preload-contract.test.tsx` of plan `docs/records/2026-08-26-plan-preload-routes.md`).
  It must be deleted.
- `packages/lint-ts/src/publy/prefer-query-display.ts` (error) flags only a hand-written
  `isPending`/`isError`/`status` ladder. A file that renders query data any other way passes.
- 54 non-test `.tsx` files call a `use*Query(` hook. 25 of them use neither `QueryDisplay`, `ListPage`
  nor `HistoryPage`. They fall into two groups:
  - **Page content**, about 13 files: staff dashboard index, staff role page and its users tab, staff
    tenant-user general / organisations / details shell, tenant users preview card, role members tab,
    tenant settings integrations, accept-invitation, staff invitation new, roles-new.
  - **Small widgets**, about 10 files: `code-select.tsx`, `filter-menu.tsx`, `sort-menu.tsx`,
    `user-menu.tsx`, `app-shell.tsx`, `_needs-reconnect-banner.tsx`, `_invite-role-select.tsx`,
    `_attach-projects-field.tsx`, `_role-form-drawer.tsx`, `_create-post-drawer.tsx`, `lib/navigation/entity-crumb.tsx`,
    `routes/authed/staff/_staff-list-team.tsx` (counts hook),
    `$userId-organizations-drawer.tsx`.
- Query options are built per domain in `apps/front/src/lib/query/*.ts` (for example
  `staffTenantDetailsQueryOptions = buildStaffQueryOptions<…>` at `staff-tenants.ts:567`), with
  `queryKey(vars)` and the hooks built on them.
- `docs/guides/front/conventions.md` wrongly calls `prefer-query-display` dormant.

## 4. Decisions

### 4.1 QueryDisplay (#2341)

1. **Rule:** a front `.tsx` file that binds the result of a `use*Query(` hook renders it through
   `QueryDisplay`, or through a component documented as delegating to it (`ListPage`, `HistoryPage`).
   No other path. Extend `publy/prefer-query-display` (stays `error`). It needs no judgement: query hook
   bound in the file ⇒ `QueryDisplay` (or a delegate) rendered in the same file.
2. **Two new ready-made modes on `QueryDisplay`**, so small widgets cost no extra code:
   - **`discreet`**: renders nothing while loading and nothing on error. For the needs-reconnect banner
     or a count badge.
   - **`inline`**: a small inline « Chargement… » and a small inline error with « Réessayer », rendered
     *inside* the element. For select options, filter and sort menus, and the user menu.
   - The default stays the page mode: skeleton, full error state, empty state.
   - Names and API shape are the builder's call (for example a `variant` prop or two thin wrappers). They
     must be real `QueryDisplay` code paths, not copies of it.
3. **Escape hatch:** one named lint-disable comment with a written reason, for a genuinely impossible
   case. Expected count: zero or close to it. Any escape is listed in the PR body.
4. A state a screen needs that `QueryDisplay` lacks is added to `QueryDisplay`, never worked around (for
   example the dashboard's « unavailable » ghost, or `no-match`).
5. Fix the docs: `docs/guides/front/conventions.md` (rule is not dormant) and `docs/guides/lint-rules.md`.

### 4.2 Preload in loaders (#2340)

(§7 and §8 below refine points 3, 5, 6 and 7.)

1. **Every route whose page renders query data gets a client `loader`** that warms the same query
   options the page uses, built from the same params and the same URL search state (list filters, sort,
   cursor, size through `loaderDeps`).
2. **Fire and forget.** The loader starts the fetch and does **not** await it, so navigation is never
   blocked. The page renders at once, and `QueryDisplay` shows data if it is cached, the skeleton
   otherwise. The existing awaiting loader (`$roleId.tsx`) is migrated to the same shape.
3. **A small shared helper** so a loader is 2–3 lines: it takes the router context plus the list of
   query options and variables, and prefetches each one, swallowing and logging (`logger.warn`) a
   failure. Name and file are the builder's call, under `apps/front/src/lib/query/`.
4. **Freshness belongs to TanStack Query**, not the router: set `defaultPreloadStaleTime: 0` on the
   router (TanStack Router guidance with an external cache), so hover does not re-run a loader against a
   router-side cache while the query cache is fresh.
5. **Mechanical check:** extend `route-loader-query-key-guard.test.ts` in the other direction. Every
   query key a route's page renders must be warmed by that route's loader, or CI fails naming the route
   and the query. "The page" includes the route-local `_*.tsx` files the route component imports
   (queries often live there, for example the #2339 dashboard's `_overview-lists.tsx`).
6. **Exceptions:** a query that cannot be known on hover carries a named escape comment with its reason.
   Examples: it depends on another query's response, or on user input on the page (search-as-you-type,
   a drawer opened by a click). The guard accepts it.
7. **A preload failure stays silent:** no toast, no error view. The real request at mount shows the
   error through `QueryDisplay`.
8. Delete `publy/route-query-preload` and its tests, and remove it from `packages/lint-ts/src/index.ts`
   and `docs/guides/lint-rules.md`.

## 5. Constraints

- **Bespoke guard admission** (`AGENTS.md`, `docs/guides/test-conventions.md`): extending the loader
  guard and the lint rule are material extensions. The PR proves every admission criterion. Owner
  mandate: « tout ça doit être mécanique » (2026-11-07).
- Repo rules apply: no `Array.reduce`, no IIFE, i18n FR+EN for every new string (« Chargement… »,
  « Réessayer »), design tokens, React Doctor clean on every changed file.
- Tests: the preload behaviour is proven with a real router. A cold cache fetches once on hover. A warm
  cache does not refetch. A failing preload stays silent and the page then shows its error state.
- The lint rule and the guard each get a fixture proving they fail on a violation (a red case) and pass
  on the fixed code.

## 6. Delivery shape

Two PRs, in this order:

1. **#2341**: `QueryDisplay` modes, rule extension, migration of the 23 files, docs.
2. **#2340**: helper, `defaultPreloadStaleTime`, loaders on every route, guard extension, deletion of
   `route-query-preload`. This one comes second because a loader without `QueryDisplay` on the page
   would not show the skeleton consistently.

Each PR may be split into tasks by the plan (for example staff routes, then tenant routes).

## 7. Settled after the builder check (captain's calls, unless marked owner)

1. **Scope: authed routes only.** The anonymous SSR pages (accept-invitation, reset-password,
   verify-email) keep their server loader and are out of the #2340 guard. They are still in the #2341
   QueryDisplay migration.
2. **"The page" = the import graph, not the stem folder.** The guard follows the route file's imports,
   transitively, into route-local `_*.tsx` files. It stops at child route files (each child is its own
   route) and at shared `components/**` and `lib/**` modules. A layout route (`authed/tenant.tsx`,
   `authed/staff.tsx`) is a route like any other: it gets its own loader for the queries its own file
   graph renders. App-shell widgets (`entity-crumb.tsx`, user menu) belong to the layout, not to every
   page. A route-local file shared by several routes (`_staff-list-team.tsx`) counts for each importing
   route.
3. **One query spec per route, shared by the loader and the page.** Each covered route declares its
   queries once: a function `(params, search) => [{ options, variables }]`. The loader passes it to the
   preload helper, and the page components read the same variables from it. Variables therefore cannot
   drift by construction, and the guard only needs factory-level identity (today's model). The guard
   learns to read the helper's call site; it stays fail-loud on any shape it cannot resolve.
4. **Unresolvable page query keys are refactored**, not skipped: an inline `useQuery({ queryKey: … })`
   with a dynamic key moves onto a named query-options factory in `lib/query/`. The plan measures how
   many files that is before sizing PR #2340.
5. **Loader exemptions:** a `// preload-exempt: <reason>` comment on the line above the `use*Query`
   call. The guard reads it, fails on an exemption without a reason, and fails on an exemption that no
   longer covers a query (so they do not rot). The PR body lists them.
6. **Lint rule detector:** the rule fires on a JSX-returning function (component) that binds a
   `use*Query` result and renders it without `QueryDisplay` or a delegate. A custom hook that only
   returns data (for example `useStaffCounterSection` in `_staff-list-team.tsx`) is not a render. The
   component that consumes it is checked instead.
7. **Bespoke placeholders stay, through `QueryDisplay` slots.** `QueryDisplay` already takes a
   `LoadingSlot`, `ErrorSlot` and `EmptySlot`. A widget with a deliberate placeholder (the breadcrumb
   skeleton bar and « — » in `entity-crumb.tsx`) passes it through those slots, so nothing visible
   changes. `discreet` and `inline` are presets of those slots, not new machinery.
8. **`ListPage` and `HistoryPage` are rewired** to render their loading / error / empty states through
   `QueryDisplay` internally, as a separate task of PR #2341. Only then are they listed as delegates.
   The DataTable convergence (`resolveTableBodyState`, `no-match` slot) is part of that task.
9. **The « unavailable » ghost** is the state shipped by the #2339 dashboard (no series served yet). It
   is added to `QueryDisplay` only if #2339 is merged first. Otherwise it is left to the endpoints work
   (queue item 17).
10. #2341 ships before #2340.

## 8. Owner decision: hover and an expired session (2026-11-08)

A preload never logs the user out. The preload helper sets `meta.skipAuthedErrorBackstop` (the existing
opt-out in `router.tsx`), so a 401 during a hover is silent. The click's real request then logs out
through the central rule, as today. Owner: « A : on ne fait rien au survol. Tu seras déconnecté au moment
où tu cliques, comme aujourd'hui. » A test proves it: an expired session plus a hover does not log out,
and the click does.

## 9. Left to the builder

- API shape and names of the two `QueryDisplay` presets, of the preload helper and of the per-route
  query spec.
- Visual details of the inline loading and error states, within the design tokens and `DESIGN.md`.
- Task split inside each PR.
