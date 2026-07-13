import {
	IconActivity,
	IconBuilding,
	IconClipboardList,
	IconLayoutDashboard,
	IconMail,
	IconReportAnalytics,
	IconShieldCheck,
	IconShieldLock,
	IconUsers,
} from '@tabler/icons-react';
import type { TablerIcon } from '@tabler/icons-react';
import type { FileRouteTypes } from '~/routeTree.gen';

export type ShellScope = 'staff' | 'tenant';

/** Every literal here must be a real, registered route — no dead links. */
export type AppRoutePath = FileRouteTypes['to'];

export type BreadcrumbItem = {
	labelKey: string;
	path?: AppRoutePath;
};

export type SecondaryPanelItemSearch = {
	status?: 'active' | 'suspended';
};

export type SecondaryPanelItem = {
	id: string;
	labelKey: string;
	path: AppRoutePath;
	Icon: TablerIcon;
	/** Search params the link must set (and that isActive must match), e.g. a status filter. */
	search?: SecondaryPanelItemSearch;
};

export type RouteId = 'dashboard' | 'tenants' | 'staff';

export type AppRouteMetadata = {
	id: RouteId;
	labelKey: string;
	scope: ShellScope;
	path: AppRoutePath;
	breadcrumbLabelKey: string;
	Icon: TablerIcon;
	matchPrefixes: string[];
	secondaryItems: SecondaryPanelItem[];
};

// -- Secondary panel rows
// Every path below is registered in src/routes.ts — nothing here may point at
// a route that doesn't exist yet (add the route first, then the nav entry).

const DASHBOARD_MODULE_ITEMS: SecondaryPanelItem[] = [
	{
		id: 'dashboard-overview',
		labelKey: 'nav-dashboard-overview',
		path: '/staff/dashboard',
		Icon: IconLayoutDashboard,
	},
	{
		id: 'dashboard-activity',
		labelKey: 'nav-dashboard-activity',
		path: '/staff/dashboard/activity',
		Icon: IconActivity,
	},
	{
		id: 'dashboard-reports',
		labelKey: 'nav-dashboard-reports',
		path: '/staff/dashboard/reports',
		Icon: IconReportAnalytics,
	},
];

const STAFF_MODULE_ITEMS: SecondaryPanelItem[] = [
	{
		id: 'staff-all-users',
		labelKey: 'nav-staff-all-users',
		path: '/staff/staff-users',
		Icon: IconUsers,
	},
	{
		id: 'staff-invitations',
		labelKey: 'nav-staff-invitations',
		path: '/staff/invitations',
		Icon: IconMail,
	},
	{
		id: 'staff-profiles',
		labelKey: 'nav-staff-profiles',
		path: '/staff/profiles',
		Icon: IconClipboardList,
	},
];

const TENANTS_MODULE_ITEMS: SecondaryPanelItem[] = [
	{
		id: 'tenants-all',
		labelKey: 'nav-tenants-all',
		path: '/staff/tenants',
		Icon: IconBuilding,
	},
	{
		id: 'tenants-active',
		labelKey: 'nav-tenants-active',
		path: '/staff/tenants',
		search: { status: 'active' },
		Icon: IconShieldCheck,
	},
	{
		id: 'tenants-suspended',
		labelKey: 'nav-tenants-suspended',
		path: '/staff/tenants',
		search: { status: 'suspended' },
		Icon: IconShieldLock,
	},
];

const itemPathname = (item: SecondaryPanelItem): string => item.path;

const itemPathnames = (items: SecondaryPanelItem[]): string[] =>
	items.map(itemPathname);

const STAFF_ROUTES: AppRouteMetadata[] = [
	{
		id: 'dashboard',
		labelKey: 'nav-dashboard',
		scope: 'staff',
		path: '/staff/dashboard',
		breadcrumbLabelKey: 'nav-dashboard',
		Icon: IconLayoutDashboard,
		matchPrefixes: [
			'/staff/dashboard',
			...itemPathnames(DASHBOARD_MODULE_ITEMS),
		],
		secondaryItems: DASHBOARD_MODULE_ITEMS,
	},
	{
		id: 'tenants',
		labelKey: 'nav-tenants',
		scope: 'staff',
		path: '/staff/tenants',
		breadcrumbLabelKey: 'nav-tenants',
		Icon: IconBuilding,
		matchPrefixes: ['/staff/tenants'],
		secondaryItems: TENANTS_MODULE_ITEMS,
	},
	{
		id: 'staff',
		labelKey: 'nav-staff',
		scope: 'staff',
		path: '/staff/staff-users',
		breadcrumbLabelKey: 'nav-staff-breadcrumb',
		Icon: IconUsers,
		matchPrefixes: [
			'/staff/staff-users',
			'/staff/invitations',
			'/staff/profiles',
		],
		secondaryItems: STAFF_MODULE_ITEMS,
	},
];

// The tenant workspace has exactly one registered route (`/tenant`, the
// tenant picker) — there is no tenant rail/panel to describe yet. Add entries
// here only once their routes exist in src/routes.ts.
const TENANT_ROUTES: AppRouteMetadata[] = [];

const STAFF_BREADCRUMB_DETAIL_LABELS: Record<string, string> = {
	'/staff/staff-users': 'nav-detail-user',
	'/staff/invitations': 'nav-detail-invitation',
	'/staff/profiles': 'nav-detail-profile',
	'/staff/tenants': 'nav-detail-tenant',
};

const createPathRules: Array<string | RegExp> = [
	'/staff/tenants/new',
	'/staff/profiles/new',
	'/staff/invitations/new',
];

const isPathPrefix = (pathname: string, prefix: string): boolean =>
	pathname === prefix || pathname.startsWith(`${prefix}/`);

const matchPath = (pathname: string, prefixes: string[]): boolean =>
	prefixes.some((prefix) => isPathPrefix(pathname, prefix));

function getMatchedPrefix(
	pathname: string,
	route: AppRouteMetadata,
): string | undefined {
	return route.matchPrefixes
		.filter((prefix) => isPathPrefix(pathname, prefix))
		.sort((a, b) => b.length - a.length)[0];
}

const isCreatePath = (pathname: string): boolean =>
	createPathRules.some((rule) =>
		typeof rule === 'string' ? pathname === rule : rule.test(pathname),
	);

export function getShellScope(pathname: string): ShellScope | undefined {
	if (isPathPrefix(pathname, '/staff')) {
		return 'staff';
	}

	if (isPathPrefix(pathname, '/tenant')) {
		return 'tenant';
	}

	return undefined;
}

export function getRailItems(scope: ShellScope): AppRouteMetadata[] {
	return scope === 'staff' ? STAFF_ROUTES : TENANT_ROUTES;
}

export function getRailItemsForPath(pathname: string): AppRouteMetadata[] {
	const scope = getShellScope(pathname);
	return scope ? getRailItems(scope) : [];
}

export function getActiveAppRoute(
	pathname: string,
): AppRouteMetadata | undefined {
	const scope = getShellScope(pathname);
	if (!scope) {
		return undefined;
	}

	return getRailItems(scope)
		.filter((route) => matchPath(pathname, route.matchPrefixes))
		.sort((a, b) => b.path.length - a.path.length)[0];
}

export function getActiveRailItem(
	pathname: string,
): AppRouteMetadata | undefined {
	return getActiveAppRoute(pathname);
}

export function getSecondaryPanelItems(pathname: string): SecondaryPanelItem[] {
	return getActiveRailItem(pathname)?.secondaryItems ?? [];
}

/**
 * A panel item is active when its pathname matches AND its declared search
 * (e.g. a status filter) matches the current search — so "All tenants" (no
 * search) and "Active" (status=active) never both light up for the same URL.
 */
export function isSecondaryPanelItemActive(
	item: SecondaryPanelItem,
	pathname: string,
	search: Record<string, unknown>,
): boolean {
	const matchesPath = isPathPrefix(pathname, item.path);
	const itemStatus = item.search?.status;
	const currentStatus =
		typeof search.status === 'string' ? search.status : undefined;

	return matchesPath && itemStatus === currentStatus;
}

function isDetailPath(pathname: string): boolean {
	if (isCreatePath(pathname)) {
		return false;
	}

	const activeRoute = getActiveRailItem(pathname);
	if (!activeRoute) {
		return false;
	}

	const matchedPrefix = getMatchedPrefix(pathname, activeRoute);
	return matchedPrefix !== undefined && matchedPrefix !== pathname;
}

/**
 * Detail routes (e.g. `/staff/tenants/$tenantId`, nested tabs, `-edit`) and
 * form routes (e.g. `/staff/tenants/new`) are rail-only: the secondary panel
 * never shows on them, independent of `sidebarOpen`. This is a global shell
 * rule, not tenants-specific — it applies wherever `isDetailPath`/
 * `isCreatePath` matches (staff-users, invitations, profiles, tenants, …).
 */
export function isRailOnlyPath(pathname: string): boolean {
	return isCreatePath(pathname) || isDetailPath(pathname);
}

/**
 * Rail-only routes (detail/form) have no persisted `sidebarOpen` default —
 * they use `railOnlyPanelOpen` instead, which defaults to closed and only
 * flips via an explicit topbar-toggle click during the session (see
 * app-shell.tsx). List routes keep using `sidebarOpen`, defaulting to open.
 */
export function shouldShowSecondaryPanel(
	pathname: string,
	options?: {
		sidebarOpen?: boolean;
		railOnlyPanelOpen?: boolean;
		viewportWidth?: number;
	},
): boolean {
	const activeItems = getSecondaryPanelItems(pathname);
	const viewportWidth = options?.viewportWidth ?? Number.POSITIVE_INFINITY;
	const panelOpen = isRailOnlyPath(pathname)
		? (options?.railOnlyPanelOpen ?? false)
		: (options?.sidebarOpen ?? true);

	return panelOpen && viewportWidth >= 1024 && activeItems.length >= 2;
}

export function getBreadcrumbsForPath(pathname: string): BreadcrumbItem[] {
	const scope = getShellScope(pathname);
	if (!scope) {
		return [{ labelKey: 'nav-root-staff', path: '/staff/staff-users' }];
	}

	const activeRoute = getActiveRailItem(pathname);
	const rootLabelKey =
		scope === 'staff' ? 'nav-root-staff' : 'nav-root-workspace';
	const rootPath: AppRoutePath = scope === 'staff' ? '/staff' : '/tenant';

	const breadcrumbs: BreadcrumbItem[] = [
		{ labelKey: rootLabelKey, path: rootPath },
	];

	if (!activeRoute) {
		return breadcrumbs;
	}

	const matchedPrefix = getMatchedPrefix(pathname, activeRoute);
	const matchedItem = activeRoute.secondaryItems.find(
		(item) => itemPathname(item) === matchedPrefix,
	);

	const labelKey =
		matchedPrefix === activeRoute.path
			? activeRoute.breadcrumbLabelKey
			: (matchedItem?.labelKey ?? activeRoute.breadcrumbLabelKey);
	breadcrumbs.push({
		labelKey,
		path: matchedItem ? matchedItem.path : activeRoute.path,
	});

	if (isDetailPath(pathname)) {
		const detailLabelKey =
			STAFF_BREADCRUMB_DETAIL_LABELS[matchedPrefix ?? activeRoute.path] ??
			'nav-detail-generic';
		breadcrumbs.push({ labelKey: detailLabelKey });
	}

	return breadcrumbs;
}
