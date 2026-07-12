import {
	IconActivity,
	IconBrandGoogleAnalytics,
	IconBuilding,
	IconCalendarCog,
	IconClipboardList,
	IconChartBar,
	IconFileAnalytics,
	IconLayout2,
	IconLayoutDashboard,
	IconLock,
	IconMail,
	IconMenu2,
	IconPuzzle,
	IconReportAnalytics,
	IconShieldCheck,
	IconShieldLock,
	IconSettings,
	IconUser,
	IconUsers,
	IconWallet,
} from '@tabler/icons-react';
import type { TablerIcon } from '@tabler/icons-react';

export type ShellScope = 'staff' | 'tenant';

export type BreadcrumbItem = {
	label: string;
	path?: string;
};

export type SecondaryPanelItemTone = 'warning' | 'neutral';

export type SecondaryPanelItemSearch = {
	status?: 'active' | 'suspended';
};

export type SecondaryPanelItem = {
	id: string;
	label: string;
	description: string;
	path: string;
	Icon: TablerIcon;
	count?: number;
	countTone?: SecondaryPanelItemTone;
	/** Search params the link must set (and that isActive must match), e.g. a status filter. */
	search?: SecondaryPanelItemSearch;
};

export type RouteId =
	| 'dashboard'
	| 'tenants'
	| 'staff'
	| 'audit-logs'
	| 'posts'
	| 'members'
	| 'settings'
	| 'account';

export type AppRouteMetadata = {
	id: RouteId;
	label: string;
	scope: ShellScope;
	path: string;
	breadcrumbLabel: string;
	Icon: TablerIcon;
	matchPrefixes: string[];
	secondaryItems: SecondaryPanelItem[];
	isBottomRailItem?: boolean;
};

// -- Secondary panel rows

const DASHBOARD_MODULE_ITEMS: SecondaryPanelItem[] = [
	{
		id: 'dashboard-overview',
		label: 'Overview',
		description: '',
		path: '/staff/dashboard',
		Icon: IconLayoutDashboard,
	},
	{
		id: 'dashboard-activity',
		label: 'Activity',
		description: '',
		path: '/staff/dashboard/activity',
		Icon: IconActivity,
	},
	{
		id: 'dashboard-reports',
		label: 'Reports',
		description: '',
		path: '/staff/dashboard/reports',
		Icon: IconReportAnalytics,
	},
];

const STAFF_MODULE_ITEMS: SecondaryPanelItem[] = [
	{
		id: 'staff-all-users',
		label: 'All users',
		description: '',
		path: '/staff/staff-users',
		Icon: IconUsers,
	},
	{
		id: 'staff-invitations',
		label: 'Invitations',
		description: '',
		path: '/staff/invitations',
		Icon: IconMail,
		count: 6,
		countTone: 'warning',
	},
	{
		id: 'staff-profiles',
		label: 'Profiles',
		description: '',
		path: '/staff/profiles',
		Icon: IconClipboardList,
	},
];

const TENANTS_MODULE_ITEMS: SecondaryPanelItem[] = [
	{
		id: 'tenants-all',
		label: 'All tenants',
		description: '',
		path: '/staff/tenants',
		Icon: IconBuilding,
	},
	{
		id: 'tenants-active',
		label: 'Active',
		description: '',
		path: '/staff/tenants',
		search: { status: 'active' },
		Icon: IconShieldCheck,
	},
	{
		id: 'tenants-suspended',
		label: 'Suspended',
		description: '',
		path: '/staff/tenants',
		search: { status: 'suspended' },
		Icon: IconShieldLock,
	},
];

const AUDIT_MODULE_ITEMS: SecondaryPanelItem[] = [
	{
		id: 'audit-all',
		label: 'All events',
		description: '',
		path: '/staff/audit-logs',
		Icon: IconFileAnalytics,
	},
	{
		id: 'audit-sign-ins',
		label: 'Sign-ins & sessions',
		description: '',
		path: '/staff/audit-logs/sign-ins',
		Icon: IconBrandGoogleAnalytics,
	},
	{
		id: 'audit-users',
		label: 'User management',
		description: '',
		path: '/staff/audit-logs/users',
		Icon: IconUsers,
	},
	{
		id: 'audit-tenants',
		label: 'Tenant lifecycle',
		description: '',
		path: '/staff/audit-logs/tenants',
		Icon: IconMenu2,
	},
	{
		id: 'audit-destructive',
		label: 'Destructive actions',
		description: '',
		path: '/staff/audit-logs/destructive',
		Icon: IconLock,
	},
];

const POSTS_PANEL_ITEMS: SecondaryPanelItem[] = [
	{
		id: 'posts-calendar',
		label: 'Calendar',
		description: '',
		path: '/tenant/posts/calendar',
		Icon: IconCalendarCog,
	},
	{
		id: 'posts-queue',
		label: 'Queue',
		description: '',
		path: '/tenant/posts/queue',
		Icon: IconMenu2,
	},
	{
		id: 'posts-drafts',
		label: 'Drafts',
		description: '',
		path: '/tenant/posts/drafts',
		Icon: IconClipboardList,
		count: 3,
		countTone: 'warning',
	},
	{
		id: 'posts-history',
		label: 'History',
		description: '',
		path: '/tenant/posts/history',
		Icon: IconLayout2,
	},
];

const MEMBERS_PANEL_ITEMS: SecondaryPanelItem[] = [
	{
		id: 'members-all',
		label: 'Members',
		description: '',
		path: '/tenant/members',
		Icon: IconUsers,
	},
	{
		id: 'members-invitations',
		label: 'Invitations',
		description: '',
		path: '/tenant/members/invitations',
		Icon: IconMail,
		count: 2,
		countTone: 'warning',
	},
	{
		id: 'members-roles',
		label: 'Roles',
		description: '',
		path: '/tenant/members/roles',
		Icon: IconClipboardList,
	},
];

const SETTINGS_PANEL_ITEMS: SecondaryPanelItem[] = [
	{
		id: 'settings-general',
		label: 'General',
		description: '',
		path: '/tenant/settings/general',
		Icon: IconLayout2,
	},
	{
		id: 'settings-workspaces',
		label: 'Workspaces',
		description: '',
		path: '/tenant/settings/workspaces',
		Icon: IconBuilding,
	},
	{
		id: 'settings-integrations',
		label: 'Integrations',
		description: '',
		path: '/tenant/settings/integrations',
		Icon: IconPuzzle,
	},
	{
		id: 'settings-billing',
		label: 'Billing',
		description: '',
		path: '/tenant/settings/billing',
		Icon: IconWallet,
	},
	{
		id: 'settings-security',
		label: 'Security',
		description: '',
		path: '/tenant/settings/security',
		Icon: IconLock,
	},
];

const ACCOUNT_PANEL_ITEMS: SecondaryPanelItem[] = [
	{
		id: 'account-profile',
		label: 'Profile',
		description: '',
		path: '/tenant/account/profile',
		Icon: IconUser,
	},
	{
		id: 'account-security',
		label: 'Security',
		description: '',
		path: '/tenant/account/security',
		Icon: IconShieldLock,
	},
	{
		id: 'account-notifications',
		label: 'Notifications',
		description: '',
		path: '/tenant/account/notifications',
		Icon: IconChartBar,
	},
];

const itemPathname = (item: SecondaryPanelItem): string =>
	item.path.split('?')[0] ?? item.path;

const itemPathnames = (items: SecondaryPanelItem[]): string[] =>
	items.map(itemPathname);

const STAFF_ROUTES: AppRouteMetadata[] = [
	{
		id: 'dashboard',
		label: 'Dashboard',
		scope: 'staff',
		path: '/staff/dashboard',
		breadcrumbLabel: 'Dashboard',
		Icon: IconLayoutDashboard,
		matchPrefixes: [
			'/staff/dashboard',
			...itemPathnames(DASHBOARD_MODULE_ITEMS),
		],
		secondaryItems: DASHBOARD_MODULE_ITEMS,
	},
	{
		id: 'tenants',
		label: 'Tenants',
		scope: 'staff',
		path: '/staff/tenants',
		breadcrumbLabel: 'Tenants',
		Icon: IconBuilding,
		matchPrefixes: ['/staff/tenants'],
		secondaryItems: TENANTS_MODULE_ITEMS,
	},
	{
		id: 'staff',
		label: 'Staff',
		scope: 'staff',
		path: '/staff/staff-users',
		breadcrumbLabel: 'Users',
		Icon: IconUsers,
		matchPrefixes: [
			'/staff/staff-users',
			'/staff/invitations',
			'/staff/profiles',
		],
		secondaryItems: STAFF_MODULE_ITEMS,
	},
	{
		id: 'audit-logs',
		label: 'Audit logs',
		scope: 'staff',
		path: '/staff/audit-logs',
		breadcrumbLabel: 'Audit logs',
		Icon: IconChartBar,
		matchPrefixes: ['/staff/audit', ...itemPathnames(AUDIT_MODULE_ITEMS)],
		secondaryItems: AUDIT_MODULE_ITEMS,
	},
];

const TENANT_ROUTES: AppRouteMetadata[] = [
	{
		id: 'posts',
		label: 'Posts',
		scope: 'tenant',
		path: '/tenant/posts',
		breadcrumbLabel: 'Posts',
		Icon: IconCalendarCog,
		matchPrefixes: ['/tenant/posts', ...itemPathnames(POSTS_PANEL_ITEMS)],
		secondaryItems: POSTS_PANEL_ITEMS,
	},
	{
		id: 'members',
		label: 'Members',
		scope: 'tenant',
		path: '/tenant/members',
		breadcrumbLabel: 'Members',
		Icon: IconUsers,
		matchPrefixes: itemPathnames(MEMBERS_PANEL_ITEMS),
		secondaryItems: MEMBERS_PANEL_ITEMS,
	},
	{
		id: 'settings',
		label: 'Settings',
		scope: 'tenant',
		path: '/tenant/settings',
		breadcrumbLabel: 'Settings',
		Icon: IconSettings,
		matchPrefixes: ['/tenant/settings', ...itemPathnames(SETTINGS_PANEL_ITEMS)],
		secondaryItems: SETTINGS_PANEL_ITEMS,
	},
	{
		id: 'account',
		label: 'Account',
		scope: 'tenant',
		path: '/tenant/account',
		breadcrumbLabel: 'Account',
		Icon: IconUser,
		matchPrefixes: ['/tenant/account', ...itemPathnames(ACCOUNT_PANEL_ITEMS)],
		secondaryItems: ACCOUNT_PANEL_ITEMS,
		isBottomRailItem: true,
	},
];

const TENANT_BOTTOM_RAIL_ITEM = TENANT_ROUTES.find(
	(route) => route.isBottomRailItem,
);

const STAFF_BREADCRUMB_DETAIL_LABELS: Record<string, string> = {
	'/staff/staff-users': 'User detail',
	'/staff/invitations': 'Invitation detail',
	'/staff/profiles': 'Profile detail',
	'/staff/tenants': 'Tenant detail',
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
	return scope === 'staff'
		? STAFF_ROUTES
		: TENANT_ROUTES.filter((route) => !route.isBottomRailItem);
}

export function getRailItemsForPath(pathname: string): AppRouteMetadata[] {
	const scope = getShellScope(pathname);
	return scope ? getRailItems(scope) : [];
}

export function getBottomRailItemForPath(
	pathname: string,
): AppRouteMetadata | undefined {
	return getShellScope(pathname) === 'tenant'
		? TENANT_BOTTOM_RAIL_ITEM
		: undefined;
}

function getAllRoutesForScope(scope: ShellScope): AppRouteMetadata[] {
	return scope === 'staff' ? STAFF_ROUTES : [...TENANT_ROUTES];
}

export function getActiveAppRoute(
	pathname: string,
): AppRouteMetadata | undefined {
	const scope = getShellScope(pathname);
	if (!scope) {
		return undefined;
	}

	if (scope === 'tenant' && pathname === '/tenant') {
		return TENANT_ROUTES.find((route) => route.id === 'posts');
	}

	const allRoutes = getAllRoutesForScope(scope);
	const [exactMatch, fallback] = allRoutes
		.filter((route) => matchPath(pathname, route.matchPrefixes))
		.sort((a, b) => b.path.length - a.path.length);

	return exactMatch ?? fallback;
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
		return [{ label: 'Staff', path: '/staff/staff-users' }];
	}

	const activeRoute = getActiveRailItem(pathname);
	const rootLabel = scope === 'staff' ? 'Staff' : 'Lattice Cloud';
	const rootPath = scope === 'staff' ? '/staff' : '/tenant';

	const breadcrumbs: BreadcrumbItem[] = [{ label: rootLabel, path: rootPath }];

	if (!activeRoute) {
		return breadcrumbs;
	}

	const matchedPrefix = getMatchedPrefix(pathname, activeRoute);
	const matchedItem = activeRoute.secondaryItems.find(
		(item) => itemPathname(item) === matchedPrefix,
	);

	if (scope === 'tenant') {
		breadcrumbs.push({
			label: activeRoute.breadcrumbLabel,
			path: activeRoute.path,
		});
		if (matchedItem && itemPathname(matchedItem) !== activeRoute.path) {
			breadcrumbs.push({
				label: matchedItem.label,
				path: itemPathname(matchedItem),
			});
		}
	} else {
		const label =
			matchedPrefix === activeRoute.path
				? activeRoute.breadcrumbLabel
				: (matchedItem?.label ?? activeRoute.breadcrumbLabel);
		breadcrumbs.push({
			label,
			path: matchedPrefix ?? activeRoute.path,
		});
	}

	if (isDetailPath(pathname)) {
		const detailLabel =
			STAFF_BREADCRUMB_DETAIL_LABELS[matchedPrefix ?? activeRoute.path] ??
			`${breadcrumbs[breadcrumbs.length - 1]?.label ?? activeRoute.breadcrumbLabel} detail`;
		if (detailLabel) {
			breadcrumbs.push({ label: detailLabel });
		}
	}

	return breadcrumbs;
}
