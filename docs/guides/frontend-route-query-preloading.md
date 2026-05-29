# Frontend Route Query Preloading

PublyApp uses TanStack Query as the only source of truth for server state. Route-level query preloading is a cache-warming convention, not a second data layer.

Use route query registries to declare the server data a route needs early enough for navigation. Components still consume data with the normal React Query Kit hooks (`useGet...`, `useFind...`, etc.).

## Core rules

- Keep TanStack Query as the only server-state store.
- Use `routeQueries(...)` to declare route-critical preload intent near the route boundary.
- Use React Query Kit `getOptions(...)` output as the query contract.
- Default to non-blocking preloads with `preload(...)`; the helper uses `queryClient.prefetchQuery(...)` for cache warming.
- Use blocking preloads only when rendering the route without that data is unsafe or misleading; blocking uses `ensureQueryData(...)` and propagates errors.
- Guard invalid params before building preload entries. The helper also skips entries whose options contain `enabled: false`.
- Run preloads after route guards/redirect decisions when the query is tenant/staff scoped or otherwise sensitive.
- Do not preload interaction-triggered data such as drawers, popovers, hover cards, or exports.
- Do not move query results into loader return data for authed product routes.

## Query classification

### Critical route data

Declare a query as critical when the route is broken, misleading, or mostly useless without it.

Examples:

- current user/session/scope data for authenticated layouts
- primary entity data for details pages
- permission or account context needed for route actions/navigation
- first visible table query for a route whose main content is a table
- metadata used for page title, breadcrumbs, or route-level gates

### Secondary route data

Declare a query as secondary when it is useful to warm early but the route remains understandable without it.

Examples:

- above-the-fold supporting cards
- small summary panels
- counts that complement the primary route content

Secondary registry entries are preloaded by `preload(...)`, but the lint convention should not force every secondary query into the registry.

### Interaction-triggered data

Declare or leave these as interaction-triggered. They should not be route-preloaded.

Examples:

- drawer or modal detail queries
- hover previews
- inactive tabs
- command palette data
- on-demand export link generation
- pagination pages the user has not requested

## Foundation helper

Route registries live in `apps/front/src/lib/react-query/route-queries.ts`.

```ts
import {
	criticalRouteQuery,
	routeQueries,
} from '#app/lib/react-query/route-queries.ts';
import { useGetStaffUserById } from '#app/lib/react-query/features/staff/users.hooks.ts';

export const staffUserDetailsRouteQueries = routeQueries(({ params }) => ({
	staffUser: criticalRouteQuery(
		useGetStaffUserById.getOptions({
			variables: { userId: params.userId },
		}),
	),
}));
```

The registry preserves the query options created by the hook factory. It does not create a new fetch path.

## Non-blocking preload by default

Most route preloads should warm the cache and let navigation continue. Non-blocking preloads use `queryClient.prefetchQuery(...)` internally so stale or missing cache entries are warmed without turning the loader into a data-return path.

```ts
import { getQueryClient } from '#app/lib/react-query/query-client.tsx';
import { getClientLoader } from '#app/lib/react-router/client-data.ts';

export const clientLoader = getClientLoader({
	loader: async (args: Route.ClientLoaderArgs) => {
		staffUserDetailsRouteQueries.preload(getQueryClient(), args);

		return null;
	},
});
```

`preload(...)` intentionally does not await the query. The component hook remains responsible for consuming the data, rendering loading state, and surfacing errors through the existing query/error-boundary path.

If a route param or search param is missing/invalid, prefer omitting the registry entry or returning options with `enabled: false`; the preload helper skips disabled entries defensively.

```ts
export const staffUserDetailsRouteQueries = routeQueries(
	({ params }: Route.ClientLoaderArgs) => {
		if (!params.userId) {
			return {};
		}

		return {
			staffUser: criticalRouteQuery(
				useGetStaffUserById.getOptions({
					variables: { userId: params.userId },
				}),
			),
		};
	},
);
```

## Blocking preload for rare route gates

Use `blockingRouteQuery(...)` only when the route should not continue until the data is available.

```ts
import {
	blockingRouteQuery,
	routeQueries,
} from '#app/lib/react-query/route-queries.ts';

export const accountGateRouteQueries = routeQueries(() => ({
	account: blockingRouteQuery(useGetAccountContext.getOptions({})),
}));

export const clientLoader = getClientLoader({
	loader: async (args: Route.ClientLoaderArgs) => {
		await accountGateRouteQueries.preloadBlocking(getQueryClient(), args);

		return null;
	},
});
```

Prefer preserving existing guards first. Convert to blocking only after the route-level requirement is explicit.

## Authenticated layout example

The authenticated layout preloads current-user auth data but keeps its component-level Suspense query during the pilot.

```ts
export const authedLayoutRouteQueries = routeQueries(() => ({
	userAuthData: criticalRouteQuery(useGetUserAuthData.getOptions({})),
}));

export const clientLoader = getClientLoader({
	loader: async (args: Route.ClientLoaderArgs) => {
		// Existing cookie/scope guard logic stays here.
		authedLayoutRouteQueries.preload(getQueryClient(), args);

		return null;
	},
});
```

Keeping `useSuspenseQueries` in the component during the pilot proves the loader warms the same QueryClient instance without changing the current UI contract.

## List route example

For list/table pages, preload only the first visible table query once route-level variables are stable.

```ts
export const tenantsListRouteQueries = routeQueries(({ request }) => {
	const url = new URL(request.url);
	const page = Number(url.searchParams.get('page') ?? '1');

	return {
		tenants: criticalRouteQuery(
			useFindTenants.getOptions({
				variables: { page },
			}),
		),
	};
});
```

Do not preload row-action drawer queries, export-link generation, or inactive tab data from the list route.

## Anti-examples

### Drawer data

```ts
// route-query-preload: ignore -- interaction-triggered drawer query
const tenantQuery = useGetTenant({ variables: { tenantId: selectedTenantId } });
```

A drawer query depends on user interaction and selected row state. Keep it component-fetched.

### Hover previews

```ts
// Keep this in the hover component; do not route-preload every possible preview.
const previewQuery = useGetUserPreview({ variables: { userId } });
```

### Inactive tabs

```ts
if (activeTab === 'activity') {
	return <ActivityPanel tenantId={tenantId} />;
}
```

The inactive tab should fetch when activated unless measurements prove a route-level waterfall matters.

### Export links

```ts
const exportMutation = useCreateExportLink();
```

Exports are actions, not route-critical data.

## Enforcement rollout

The custom `@org/lint-ts` Oxlint plugin can detect route files that directly call critical-looking `useGet...` or `useFind...` hooks without a route registry.

Rollout order:

1. Add the helper and docs.
2. Refine helper semantics: non-blocking preloads use `prefetchQuery(...)`, blocking preloads use `ensureQueryData(...)`, and disabled query options are skipped.
3. Convert one layout pilot.
4. Manually verify the layout pilot does not duplicate requests.
5. Convert one params-based details route.
6. Manually verify navigation timing, warmed-cache reuse, invalid-param behavior, and component-level error behavior.
7. Do one list/table feasibility spike once URL-derived variables are stable.
8. Add the lint rule in advisory/report-only mode.
9. Convert more route families.
10. Promote the rule only after false positives are understood.

Escape comments must include a reason. Do not add silent ignores.

## Pilot acceptance checklist

Before promoting this convention beyond pilots, record manual verification notes in the implementation PR:

- Authed layout preload uses the same browser QueryClient as `QueryClientProvider`.
- Authed layout navigation does not produce duplicate auth-data requests for one navigation.
- Details route preload starts during navigation, before the component query is evaluated.
- Details component hook reuses warmed cache or dedupes the in-flight query.
- Missing/invalid route params do not produce malformed preload requests.
- Redirect paths do not start sensitive tenant/staff-scoped preloads before the redirect decision.
- Non-blocking preload failure does not hide the component hook's normal loading/error path.
