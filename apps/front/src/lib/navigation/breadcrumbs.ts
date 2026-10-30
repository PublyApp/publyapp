import {
	getActiveRailItem,
	getShellScope,
} from '~/lib/navigation/route-metadata';
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

/**
 * The trail root is the page's SECTION, not the scope (#2273 §2.3): the
 * organisations section roots at "Organisations", the dashboard at
 * "Tableau de bord", the staff-members section at "Équipe", the jobs
 * section at "Tâches". `nav-root-staff` is only the fallback for an orphan
 * staff path that belongs to no rail section (e.g. the legacy global
 * tenant-user details route tracked in #2273 §8.2).
 */
const rootCrumbForScope = (pathname: string): BreadcrumbRootItem => {
	const scope = getShellScope(pathname);

	if (scope === 'tenant') {
		return { labelKey: 'nav-root-workspace', path: '/tenant' };
	}

	const section = getActiveRailItem(pathname);
	if (section) {
		return { labelKey: section.labelKey, path: section.path };
	}
	return { labelKey: 'nav-root-staff', path: '/staff' };
};

/**
 * Routes declare their whole tail after the scope root, and many begin with
 * their own section label (legacy shape: "Équipe › Organisations"). Now that
 * the root IS that section, the duplicated leading label is dropped in one
 * place rather than edited into every route declaration.
 */
const stripRepeatedRoot = (
	tail: readonly CrumbSpec[],
	root: BreadcrumbRootItem,
): readonly CrumbSpec[] => {
	const [first] = tail;
	if (first?.kind === 'label' && first.labelKey === root.labelKey) {
		return tail.slice(1);
	}
	return tail;
};

/**
 * Walks from the deepest match upward for the first route that declares a
 * real tail (skipping `'shell'` escapes — pathless layouts, redirect-only
 * stubs, auth/marketing surfaces). Returns just the scope root when nothing
 * in the current match set opts in (e.g. mid-redirect on `/staff`).
 */
export const deriveBreadcrumbTrail = (
	matches: readonly MatchForBreadcrumbs[],
) => {
	const deepestPathname = matches[matches.length - 1]?.pathname ?? '/';
	const root = rootCrumbForScope(deepestPathname);

	for (let index = matches.length - 1; index >= 0; index -= 1) {
		const match = matches[index];
		if (!match || match.staticData.crumbs === 'shell') {
			continue;
		}

		return {
			root,
			tail: stripRepeatedRoot(match.staticData.crumbs(match.params), root),
			params: match.params,
		};
	}

	return { root, tail: [], params: {} };
};
