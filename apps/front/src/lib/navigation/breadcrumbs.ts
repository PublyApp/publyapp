import { getShellScope } from '~/lib/navigation/route-metadata';
import type { AppRoutePath } from '~/lib/navigation/route-metadata';

import type {
	AuditLogDetail,
	GetStaffProfileByIdResult,
	GetStaffUserByIdResult,
	GetTenantAsStaffResult,
	GetTenantProfileByIdResponse,
	StaffInvitationDetails,
	TenantUserDetailsResult,
} from '@org/client-ts/models/index';

/**
 * The entity payloads the shell's entity crumbs can resolve. Each member is
 * the DTO produced by one domain's `*CrumbQuery` fetcher (`staff-*.ts`);
 * adding a new entity crumb means adding its DTO here, on purpose.
 */
type EntityCrumbPayload =
	| AuditLogDetail
	| GetStaffProfileByIdResult
	| GetStaffUserByIdResult
	| GetTenantAsStaffResult
	| GetTenantProfileByIdResponse
	| StaffInvitationDetails
	| TenantUserDetailsResult;

/**
 * The minimal shape `useQuery` needs. Route crumb specs build this from the
 * SAME `xxxDetailsQueryOptions` factory the page itself queries, so the key
 * matches and TanStack Query dedupes the request — a page that already
 * cached the entity paints its crumb name instantly.
 *
 * `queryFn` resolves a named entity payload; the pairing `CrumbSpec.select`
 * owns the `payload → name` narrowing (see `EntityCrumb` in
 * `entity-crumb.tsx`).
 */
export type EntityCrumbQuery = {
	queryKey: readonly unknown[];
	queryFn: () => Promise<EntityCrumbPayload>;
};

/**
 * `to` is a plain `string`, not `AppRoutePath` (the literal route-template
 * union), on BOTH variants — an intermediate crumb under a dynamic route
 * (e.g. "Profiles" under a specific tenant, or the tenant entity itself)
 * needs an already-interpolated concrete href like
 * `` `/staff/tenants/${tenantId}/profiles` ``, which is never a member of
 * that literal union. This matches how the router's own `Link` falls back to
 * loose `string` acceptance once a value's static type can't be narrowed to a
 * specific literal.
 */
export type CrumbSpec =
	| { kind: 'label'; labelKey: string; to?: string }
	| {
			kind: 'entity';
			to?: string;
			query: (params: Record<string, string>) => EntityCrumbQuery;
			select: (data: unknown) => string | undefined;
	  };

/**
 * A route's breadcrumb declaration. `'shell'` opts a route out of ever
 * supplying the trail (auth/marketing surfaces, pathless layouts, redirect-
 * only stubs) — the deepest match in the current tree whose `crumbs` is not
 * `'shell'` supplies the full tail after the scope's root crumb. Routes are
 * flat (see docs/guides/front/conventions.md), so the deepest match declares
 * its ENTIRE trail tail, not just its own segment.
 */
type RouteCrumbs =
	| 'shell'
	| ((params: Record<string, string>) => readonly CrumbSpec[]);

declare module '@tanstack/react-router' {
	interface StaticDataRouteOption {
		crumbs: RouteCrumbs;
	}
}

type BreadcrumbRootItem = {
	labelKey: string;
	path: AppRoutePath;
};

export type MatchForBreadcrumbs = {
	pathname: string;
	params: Record<string, string>;
	staticData: { crumbs: RouteCrumbs };
};

const rootCrumbForScope = (pathname: string): BreadcrumbRootItem => {
	const scope = getShellScope(pathname);

	return scope === 'tenant'
		? { labelKey: 'nav-root-workspace', path: '/tenant' }
		: { labelKey: 'nav-root-staff', path: '/staff' };
};

export type BreadcrumbTrail = {
	root: BreadcrumbRootItem;
	tail: readonly CrumbSpec[];
	/**
	 * The params of the match whose `crumbs` function produced `tail` — an
	 * `entity` spec's own `query` needs the same params again at render time
	 * (it resolves lazily, once per crumb, so the query only fires for the
	 * crumb actually on screen).
	 */
	params: Record<string, string>;
};

/**
 * Walks from the deepest match upward for the first route that declares a
 * real tail (skipping `'shell'` escapes — pathless layouts, redirect-only
 * stubs, auth/marketing surfaces). Returns just the scope root when nothing
 * in the current match set opts in (e.g. mid-redirect on `/staff`).
 */
export const deriveBreadcrumbTrail = (
	matches: readonly MatchForBreadcrumbs[],
): BreadcrumbTrail => {
	const deepestPathname = matches[matches.length - 1]?.pathname ?? '/';
	const root = rootCrumbForScope(deepestPathname);

	for (let index = matches.length - 1; index >= 0; index -= 1) {
		const match = matches[index];
		if (!match || match.staticData.crumbs === 'shell') {
			continue;
		}

		return {
			root,
			tail: match.staticData.crumbs(match.params),
			params: match.params,
		};
	}

	return { root, tail: [], params: {} };
};
