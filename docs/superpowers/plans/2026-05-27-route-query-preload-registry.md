# Route Query Preload Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit, type-safe route query registry pattern for PublyApp so route-critical TanStack Query / React Query Kit queries are preloaded early and consistently without runtime hoisting magic.

**Architecture:** Keep TanStack Query as the only server-state source of truth. Route loaders only warm the cache through React Query Kit `getOptions(...)`, preferably non-blocking, while route components keep using query hooks normally. Enforcement should start as conventions + typed helpers + docs, then graduate to static analysis once the pattern is validated on real routes.

**Tech Stack:** React Router v7 framework mode, TanStack Query v5, React Query Kit, TypeScript strict mode, pnpm, oxlint/oxfmt, React Router typegen.

---

## Current repo observations

- React Query Kit wrappers live in `apps/front/src/lib/react-query/create-hooks.ts` and already expose compatible hook objects with `getOptions(...)` / `getKey(...)`.
- QueryClient is provided at the root in `apps/front/src/root.tsx` through `QueryClientProvider`.
- Route helpers exist:
  - `apps/front/src/lib/react-router/client-data.ts`
  - `apps/front/src/lib/react-router/server-data.server.ts`
- `apps/front/src/routes/authed/_layout/authed-layout.tsx` currently preloads auth data inside a component using `useSuspenseQueries({ queries: [useGetUserAuthData.getOptions({})] })`, not in a route loader.
- Many route components and route-local parts directly use critical-looking queries (`useGetStaffUserById`, `useGetTenant`, `useFindTenants`, `useFindStaffInvitations`, etc.) without a route-level preload declaration.
- There is no existing `routeQueries(...)` helper, route query registry convention, or query preload lint rule.

## Proposed scope boundary

This should be implemented in four staged slices:

1. **Foundation:** helper + types + docs.
2. **Pilot:** convert a small set of representative routes.
3. **Enforcement:** custom `@org/lint-ts` / Oxlint rule that catches missing critical preloads.
4. **Scale-out:** migrate route families gradually, using the check to prevent regressions.

Avoid trying to auto-hoist query hooks at runtime. That becomes unreliable with conditionals, drawers, tabs, responsive rendering, lazy children, infinite scroll, and interaction-triggered fetches.

---

## File structure

### Create

- `apps/front/src/lib/react-query/route-queries.ts`
  - Defines the `routeQueries(...)` registry helper.
  - Supports non-blocking preload by default.
  - Supports optional blocking preload for rare cases.
  - Exposes query classification metadata in a minimal, typed way.

- `apps/front/src/lib/react-query/route-queries.test-d.ts` or equivalent type-check fixture if the repo already has a type assertion convention later.
  - Optional first pass. If no type-test setup exists, document expected types instead of adding a new testing dependency.

- `docs/guides/frontend-route-query-preloading.md`
  - Documents when to preload and when not to preload.
  - Gives canonical examples for route registries.
  - Documents non-blocking `void ensureQueryData(...)` vs blocking `await ensureQueryData(...)`.

- `packages/lint-ts/src/rules/route-query-preload.js`
  - Later enforcement rule in the existing custom Oxlint JS plugin.
  - Should start conservative/report-only or warning-level until the route registry convention is proven.

- `packages/lint-ts/src/rules/route-query-preload.test.js`
  - RuleTester coverage for direct route query usage, registry presence, and escape comments.

### Modify

- `apps/front/src/lib/react-query/create-hooks.ts`
  - Only if needed to export shared types for query options. Prefer not to change unless TypeScript forces it.

- `apps/front/src/routes/authed/_layout/authed-layout.tsx`
  - Candidate pilot: move/duplicate auth preload intent into route registry while preserving current guard behavior.

- One representative details route, for example:
  - `apps/front/src/routes/authed/staff/staff-users/details/staff-user-details-page.tsx`
  - or `apps/front/src/routes/authed/staff/tenants/details/_layout/tenant-details-layout.tsx`

- One representative list/table route, for example:
  - `apps/front/src/routes/authed/staff/tenants/list/_parts/tenants-table.tsx`
  - or keep list routes for a second phase if URL-derived variables make the first pass noisy.

- `packages/lint-ts/src/index.js`
  - Register the new rule under the existing `publy` namespace.

- `.oxlintrc.json`
  - Add `publy/route-query-preload` after the pilot signal/noise is acceptable.
  - Prefer advisory/warning-level enforcement first if the repo wants a soft rollout.

- `AGENTS.md`
  - Add a short pointer to the new guide after the pattern stabilizes.

---

## Route query classification rules

Use this default policy:

### Critical route data — must be declared in route registry

Preload if the page/layout is broken, misleading, or mostly useless without it.

Examples:

- primary entity for details pages
- current user/session/scope auth data
- permissions required to render navigation or route actions
- primary table rows when the route is a table/list page
- route metadata that affects title/breadcrumbs/permission gates

### Secondary data — optional, usually component-fetched

Do not require preload unless measurements show a waterfall problem.

Examples:

- analytics cards below the fold
- secondary panels
- comments/activity streams
- inactive tabs
- optional side widgets

### Interaction-triggered data — should not be route-preloaded

Examples:

- modal/drawer content
- hover previews
- command palettes
- popovers
- on-demand export links
- pagination pages the user has not requested

---

## Task 1: Add `routeQueries(...)` foundation helper

**Files:**

- Create: `apps/front/src/lib/react-query/route-queries.ts`
- Optional modify: `apps/front/src/lib/react-query/create-hooks.ts`

- [x] **Step 1: Write the helper API shape**

Create `apps/front/src/lib/react-query/route-queries.ts` with a minimal API like:

```ts
import type { QueryClient, QueryKey } from '@tanstack/react-query';

type QueryOptionsLike = {
	queryKey: QueryKey;
	queryFn?: unknown;
};

type RouteQueryPriority = 'critical' | 'secondary' | 'interaction';

type RouteQueryEntry<TOptions extends QueryOptionsLike = QueryOptionsLike> = {
	options: TOptions;
	priority: RouteQueryPriority;
	blocking?: boolean;
};

type RouteQueriesFactory<TContext, TQueries extends Record<string, RouteQueryEntry>> = (
	context: TContext,
) => TQueries;

export const criticalRouteQuery = <TOptions extends QueryOptionsLike>(
	options: TOptions,
): RouteQueryEntry<TOptions> => ({ options, priority: 'critical' });

export const secondaryRouteQuery = <TOptions extends QueryOptionsLike>(
	options: TOptions,
): RouteQueryEntry<TOptions> => ({ options, priority: 'secondary' });

export const interactionRouteQuery = <TOptions extends QueryOptionsLike>(
	options: TOptions,
): RouteQueryEntry<TOptions> => ({ options, priority: 'interaction' });

export const blockingRouteQuery = <TOptions extends QueryOptionsLike>(
	options: TOptions,
): RouteQueryEntry<TOptions> => ({
	options,
	priority: 'critical',
	blocking: true,
});

export function routeQueries<TContext, TQueries extends Record<string, RouteQueryEntry>>(
	factory: RouteQueriesFactory<TContext, TQueries>,
) {
	return {
		build: factory,

		preload(queryClient: QueryClient, context: TContext) {
			const queries = factory(context);

			for (const query of Object.values(queries)) {
				if (query.priority === 'interaction') {
					continue;
				}

				void queryClient.ensureQueryData(query.options as never);
			}
		},

		async preloadBlocking(queryClient: QueryClient, context: TContext) {
			const queries = factory(context);
			const blockingQueries = Object.values(queries).filter(
				(query) => query.blocking,
			);

			await Promise.all(
				blockingQueries.map((query) =>
					queryClient.ensureQueryData(query.options as never),
				),
			);
		},
	};
}
```

- [x] **Step 2: Run typecheck**

Run:

```bash
pnpm --filter front type-check
```

Expected: either passes, or exposes exact type friction around `QueryOptionsLike` that should be fixed without weakening route component types.

- [x] **Step 3: Refine types minimally**

If React Query Kit `getOptions(...)` return types do not satisfy `QueryOptionsLike`, adjust `QueryOptionsLike` to use TanStack's actual `EnsureQueryDataOptions`/`FetchQueryOptions`-compatible type.

Do not introduce `any` unless isolated to one cast at the `ensureQueryData(...)` boundary with a comment explaining the React Query Kit/TanStack type mismatch.

- [x] **Step 4: Run formatting and frontend typecheck**

Run:

```bash
pnpm format:write
pnpm --filter front type-check
```

Expected: formatting completes and typecheck passes.

---

## Task 2: Document the route query preloading convention

**Files:**

- Create: `docs/guides/frontend-route-query-preloading.md`
- Later modify: `AGENTS.md`

- [x] **Step 1: Write the guide**

The guide must include:

- principle: TanStack Query remains the only server-state source of truth
- loaders/route registries warm the cache only
- non-blocking preloads are the default
- blocking preloads are rare and explicit
- classification model: critical / secondary / interaction
- examples for details routes, list routes, layout auth data, and drawer data

Example snippet:

```ts
export const staffUserDetailsRouteQueries = routeQueries(({ params }) => ({
	user: criticalRouteQuery(
		useGetStaffUserById.getOptions({
			variables: { userId: params.userId },
		}),
	),
}));
```

- [x] **Step 2: Add anti-examples**

Include examples of queries that should not be globally preloaded:

- drawer detail queries
- hover previews
- inactive tabs
- export link generation

- [x] **Step 3: Add a short AGENTS.md pointer**

After the guide is reviewed, add a short bullet to `AGENTS.md` pointing frontend work to `docs/guides/frontend-route-query-preloading.md`.

- [x] **Step 4: Verify docs formatting**

Run:

```bash
pnpm format:write
```

Expected: no formatting errors.

---

## Task 3: Pilot on the authed layout auth query

**Files:**

- Modify: `apps/front/src/routes/authed/_layout/authed-layout.tsx`

- [x] **Step 1: Add a route query registry near the route exports**

Use the existing `useGetUserAuthData.getOptions({})` query as the first critical query.

```ts
export const authedLayoutRouteQueries = routeQueries(() => ({
	userAuthData: criticalRouteQuery(useGetUserAuthData.getOptions({})),
}));
```

- [x] **Step 2: Warm query cache in `clientLoader` if a browser QueryClient is safely accessible**

If `getQueryClient()` can be imported from the query-client module without creating duplicate clients, call:

```ts
authedLayoutRouteQueries.preload(getQueryClient(), {});
```

The call should be non-blocking.

If this is unsafe because the loader and root provider might not share the same browser singleton, stop and fix that architecture first. The loader must warm the same client instance used by `QueryClientProvider`.

- [x] **Step 3: Keep `useSuspenseQueries` during pilot**

Do not remove the existing `useSuspenseQueries` yet. During the pilot it acts as the component-level consumer of the same query contract and preserves current UX.

- [ ] **Step 4: Verify no duplicate network request in devtools/manual inspection later**

Manual check after dev server is available:

```bash
just dev-front
```

Navigate to an authed route and verify the auth query is not fetched twice from the same navigation.

- [x] **Step 5: Run typecheck**

```bash
pnpm --filter front type-check
```

Expected: pass.

---

## Task 4: Pilot on one details route

**Files:**

- Modify one route file, suggested: `apps/front/src/routes/authed/staff/staff-users/details/staff-user-details-page.tsx`

- [ ] **Step 1: Identify params and query variables**

Read the route file and its generated `Route` type usage. Confirm the exact param name used for the staff user id.

- [ ] **Step 2: Add a route query registry**

Example shape:

```ts
export const staffUserDetailsRouteQueries = routeQueries(
	({ params }: Route.ClientLoaderArgs) => ({
		staffUser: criticalRouteQuery(
			useGetStaffUserById.getOptions({
				variables: { userId: params.userId },
			}),
		),
	}),
);
```

Adjust names to match the actual route params.

- [ ] **Step 3: Add non-blocking preload in loader/clientLoader**

If the route currently lacks a loader, add the lightest loader compatible with React Router framework mode and existing route conventions.

- [ ] **Step 4: Keep component hook usage unchanged**

The component should continue to call:

```ts
const getByIdQuery = useGetStaffUserById({ variables: { userId } });
```

The registry is not a replacement for component query hooks; it is preload intent.

- [ ] **Step 5: Run typecheck**

```bash
pnpm --filter front type-check
```

Expected: pass.

---

## Task 5: Add route-query preload enforcement to the existing Oxlint plugin

**Files:**

- Create: `packages/lint-ts/src/rules/route-query-preload.js`
- Create: `packages/lint-ts/src/rules/route-query-preload.test.js`
- Modify: `packages/lint-ts/src/index.js`
- Modify later: `.oxlintrc.json`

- [ ] **Step 1: Build a conservative Oxlint rule**

Use the existing `@org/lint-ts` package instead of a separate script. The repo already has:

- `packages/lint-ts/src/index.js`
- `packages/lint-ts/src/rules/no-op.js`
- `packages/lint-ts/src/rules/no-op.test.js`
- `.oxlintrc.json` with `"jsPlugins": ["./packages/lint-ts/src/index.js"]`

The rule should:

- only care about `apps/front/src/routes/**/*.tsx` files
- find route files that import/use query hooks matching `use[A-Z].*`
- ignore mutations by name (`useCreate`, `useUpdate`, `useDelete`, `useSend`, etc.) initially
- flag files that call critical-looking `useGet...`/`useFind...` hooks directly but do not export a `*RouteQueries` registry or call `routeQueries(...)`

This is intentionally conservative. Do not enable it as an error until the first pilot routes are converted and the false-positive profile is known.

- [ ] **Step 2: Add an allowlist comment convention**

Support:

```ts
// route-query-preload: ignore -- interaction-triggered drawer query
```

or file-level:

```ts
// route-query-preload: route-has-no-critical-query
```

- [ ] **Step 3: Register the rule in the plugin index**

Modify `packages/lint-ts/src/index.js`:

```js
import { noOp } from './rules/no-op.js';
import { routeQueryPreload } from './rules/route-query-preload.js';

const plugin = {
	meta: {
		name: 'publy',
	},
	rules: {
		'no-op': noOp,
		'route-query-preload': routeQueryPreload,
	},
};

export default plugin;
```

Do not enable the rule in `.oxlintrc.json` until the pilot routes are converted and false positives are acceptable.

- [ ] **Step 4: Add RuleTester coverage**

Follow the existing `packages/lint-ts/src/rules/no-op.test.js` pattern with `node:test` and `oxlint/plugins-dev`.

Cover at least:

- valid route file with `routeQueries(...)`
- valid route file with `// route-query-preload: route-has-no-critical-query`
- valid interaction-triggered query with reasoned ignore comment
- invalid route file that calls `useGet...` without a registry
- invalid route file that calls `useFind...` without a registry

- [ ] **Step 5: Test the plugin package**

Run:

```bash
pnpm --filter @org/lint-ts test
```

Expected: pass.

- [ ] **Step 6: Enable only after pilots are converted**

Add to `.oxlintrc.json` later:

```json
"publy/route-query-preload": "warn"
```

Promote to `"error"` only after the team accepts the convention and enough route families are converted.

---

## Task 6: Convert one list/table route after details pilot succeeds

**Files:**

- Suggested: `apps/front/src/routes/authed/staff/tenants/list/_parts/tenants-table.tsx` plus the owning route page/layout file.

- [ ] **Step 1: Identify where URL state is parsed**

List/table queries often depend on pagination, filters, sort, and search params. Find the route-level page component that owns those URL params.

- [ ] **Step 2: Keep table internals component-fetched until variables are stable**

Do not force preload into `_parts` files. Preload belongs in route files or route-local registries near route boundaries.

- [ ] **Step 3: Add registry for only the first visible table query**

Do not preload drawer/row action queries, link-generation queries, or comparison queries.

- [ ] **Step 4: Run typecheck and manual navigation check**

```bash
pnpm --filter front type-check
```

Manual check later: navigate to list route and verify the first page query starts during navigation, not only after table render.

---

## Task 7: Decide whether to graduate the Oxlint rule from advisory to required

**Files:**

- Modify: `.oxlintrc.json`
- Possibly modify: `docs/guides/frontend-route-query-preloading.md`

- [ ] **Step 1: Review checker signal/noise after 5-10 route conversions**

If false positives are low, make `publy/route-query-preload` fail on new violations.

- [ ] **Step 2: Add to root lint flow**

Modify `.oxlintrc.json`:

```json
"publy/route-query-preload": "error"
```

Because root `pnpm lint` already runs `oxlint --quiet .`, no separate package script is needed once the rule is enabled.

- [ ] **Step 3: Document escape hatches**

Escapes must require a reason comment. No silent ignores.

---

## Verification plan

Run after each implementation slice:

```bash
pnpm --filter front type-check
pnpm format:write
pnpm lint
```

For route-loader behavior, also run a manual browser check later:

```bash
just dev-front
```

Then inspect network timing for one converted details route and one converted list route.

Completion is not just typecheck passing. The implementation is complete only when:

- query registry helper exists
- docs explain classification and examples
- at least one layout/details pilot route is converted
- the Oxlint plugin rule reports useful candidates
- no route loader becomes a second server-state store
- component query hooks remain the normal data consumption API

---

## Open design questions before implementation

1. Should the registry live under `lib/react-query` or `lib/react-router`? My recommendation: `lib/react-query`, because the concept is cache/query-contract first, router integration second.
2. Should route loaders preload on server too, or only client loaders initially? My recommendation: start with client-side navigation preloading first; SSR hydration is a separate design pass.
3. Should auth layout queries stay suspense-blocking? My recommendation: preserve current behavior first, then decide if non-blocking auth preload is viable after measuring UX/security implications.
4. Should `secondaryRouteQuery(...)` preload by default? My recommendation: yes for explicit registry secondary entries, but do not enforce their presence.
5. Should list/table first page data be considered critical? My recommendation: yes for routes whose main content is the table, but be strict about variables and avoid preloading row action/drawer data.

---

## Recommended execution order

1. Foundation helper.
2. Documentation.
3. Authed layout pilot.
4. One details route pilot.
5. Oxlint plugin rule in advisory mode.
6. One list/table pilot.
7. Review results and decide whether to promote the Oxlint rule to required lint enforcement.
