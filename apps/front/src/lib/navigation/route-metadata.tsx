import {
	IconActivity,
	IconBuilding,
	IconClipboardList,
	IconClock,
	IconHistory,
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

export type SecondaryPanelItemSearch = {
	status?: 'pending' | 'active' | 'suspended';
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
	{
		id: 'staff-audit-logs',
		labelKey: 'nav-staff-audit-logs',
		path: '/staff/audit-logs',
		Icon: IconHistory,
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
		id: 'tenants-pending',
		labelKey: 'nav-tenants-pending',
		path: '/staff/tenants',
		search: { status: 'pending' },
		Icon: IconClock,
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
		Icon: IconBuilding,
		matchPrefixes: ['/staff/tenants'],
		secondaryItems: TENANTS_MODULE_ITEMS,
	},
	{
		id: 'staff',
		labelKey: 'nav-staff',
		scope: 'staff',
		path: '/staff/staff-users',
		Icon: IconUsers,
		matchPrefixes: [
			'/staff/staff-users',
			'/staff/invitations',
			'/staff/profiles',
			'/staff/audit-logs',
		],
		secondaryItems: STAFF_MODULE_ITEMS,
	},
];

// The tenant workspace has exactly one registered route (`/tenant`, the
// tenant picker) — there is no tenant rail/panel to describe yet. Add entries
// here only once their routes exist in src/routes.ts.
const TENANT_ROUTES: AppRouteMetadata[] = [];

const isPathPrefix = (pathname: string, prefix: string): boolean =>
	pathname === prefix || pathname.startsWith(`${prefix}/`);

const matchPath = (pathname: string, prefixes: string[]): boolean =>
	prefixes.some((prefix) => isPathPrefix(pathname, prefix));

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

export function shouldShowSecondaryPanel(
	pathname: string,
	options?: {
		sidebarOpen?: boolean;
		viewportWidth?: number;
	},
): boolean {
	const activeItems = getSecondaryPanelItems(pathname);
	const viewportWidth = options?.viewportWidth ?? Number.POSITIVE_INFINITY;
	const panelOpen = options?.sidebarOpen ?? true;

	return panelOpen && viewportWidth >= 1024 && activeItems.length >= 2;
}
