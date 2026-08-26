import {
	IconActivity,
	IconBuilding,
	IconCalendarEvent,
	IconClipboardList,
	IconClock,
	IconHistory,
	IconLayoutDashboard,
	IconMail,
	IconReportAnalytics,
	IconSettings,
	IconShieldCheck,
	IconShieldLock,
	IconUserCircle,
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
	/** Match the pathname EXACTLY instead of by prefix — for a panel row whose
	 * path is a prefix of a sibling row's path (the account module's Profile
	 * row at `/tenant/account` would otherwise stay lit on
	 * `/tenant/account/security`). */
	matchExact?: boolean;
};

export type RouteId =
	| 'dashboard'
	| 'tenants'
	| 'staff'
	| 'account'
	| 'settings'
	| 'posts'
	| 'organizations';

export type AppRouteMetadata = {
	id: RouteId;
	labelKey: string;
	scope: ShellScope;
	path: AppRoutePath;
	Icon: TablerIcon;
	matchPrefixes: string[];
	secondaryItems: SecondaryPanelItem[];
	/**
	 * Permission keys (from the scope-auth-data `permissions` list) the signed-in
	 * user must hold for this entry to render. An EMPTY array means the entry is
	 * unconditioned — always visible. Every non-empty list MUST mirror a gate the
	 * API enforces server-side on the underlying surface (#142): hiding a menu
	 * entry is convenience, NOT authorization.
	 */
	requiredPermissions: string[];
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
		// Staff surfaces carry no module-level gate today; the staff rail stays
		// unconditioned until a staff permission taxonomy exists (#142).
		requiredPermissions: [],
	},
	{
		id: 'tenants',
		labelKey: 'nav-tenants',
		scope: 'staff',
		path: '/staff/tenants',
		Icon: IconBuilding,
		matchPrefixes: ['/staff/tenants'],
		secondaryItems: TENANTS_MODULE_ITEMS,
		requiredPermissions: [],
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
		requiredPermissions: [],
	},
];

const ACCOUNT_MODULE_ITEMS: SecondaryPanelItem[] = [
	{
		id: 'account-profile',
		labelKey: 'profile',
		path: '/tenant/account',
		Icon: IconUserCircle,
		matchExact: true,
	},
	// #818 F8: Security and Notifications are hidden from the account panel
	// until their APIs exist (no password-change / 2FA / session endpoints,
	// no preferences endpoint). The routes stay registered — deep links keep
	// working; each hidden destination tracks its build work in its own issue.
];

// The tenant workspace sections — the rail's primary entries for tenant
// users. Their child routes (e.g. the account sections) are covered by the
// module's matchPrefixes; the account module also carries its children as
// secondary panel rows, mirroring the staff modules.
// #818 F8: Organizations is hidden from the rail until an organizations API
// exists (the page itself is an honest read-only surface and stays reachable
// by deep link). It tracks its build work in its own issue.
const TENANT_ROUTES: AppRouteMetadata[] = [
	{
		id: 'account',
		labelKey: 'account',
		scope: 'tenant',
		path: '/tenant/account',
		Icon: IconUserCircle,
		matchPrefixes: ['/tenant/account'],
		secondaryItems: ACCOUNT_MODULE_ITEMS,
		// The personal settings rail — every signed-in tenant member owns their
		// own profile, so no permission key applies.
		requiredPermissions: [],
	},
	{
		id: 'settings',
		labelKey: 'settings',
		scope: 'tenant',
		path: '/tenant/settings',
		Icon: IconSettings,
		matchPrefixes: ['/tenant/settings'],
		secondaryItems: [],
		// Mirrors the canonical tenant-module gate (TenantModulePermissionsForTenant
		// → `modules.access_settings`), the same key the settings surface is
		// governed by server-side.
		requiredPermissions: ['tenant.modules.access_settings'],
	},
	{
		id: 'posts',
		labelKey: 'posts',
		scope: 'tenant',
		path: '/tenant/posts',
		Icon: IconCalendarEvent,
		matchPrefixes: ['/tenant/posts'],
		secondaryItems: [],
		// Deliberately NOT a `modules.access_*` key: this is the exact key
		// `.WithTenantPermission([AppPermissions.Tenant.Posts.VIEW])` enforces on
		// GET /posts, so a hidden rail entry and a direct URL hit fail on the
		// same missing grant (the #142 invariant the API spec pins).
		requiredPermissions: ['tenant.posts.view'],
	},
	{
		id: 'organizations',
		labelKey: 'organizations',
		scope: 'tenant',
		path: '/tenant/organizations',
		Icon: IconBuilding,
		matchPrefixes: ['/tenant/organizations'],
		secondaryItems: [],
		// Static placeholder surface (“coming later”) with no server resource
		// behind it yet — nothing to mirror, so it stays unconditioned.
		requiredPermissions: [],
	},
];

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

export type RailPermissionOptions = {
	/**
	 * The signed-in user's effective permission keys for the current scope
	 * (the `permissions` list of `/auth/scope-auth-data`). When omitted, NO
	 * filtering happens — pre-permission callers (unit tests, shells that
	 * render before auth data lands) keep seeing the full rail.
	 */
	allowedPermissions?: Set<string>;
};

/**
 * Keeps only the entries whose required permission keys are ALL granted. An
 * entry with an empty `requiredPermissions` list is unconditioned and always
 * survives — this is a UI-convenience filter ONLY; the server independently
 * enforces every gate behind these keys (#142: hiding a menu entry is not
 * authorization).
 */
export function filterRailItemsByPermissions(
	items: AppRouteMetadata[],
	allowedPermissions: Set<string>,
): AppRouteMetadata[] {
	// "*" is the backend's Admin sentinel (materialised by user-auth-data for
	// AccountLevel.Admin and honoured by TenantPermissionFilter): an admin
	// passes every gate, so every rail entry stays visible.
	if (allowedPermissions.has('*')) {
		return items;
	}
	return items.filter(
		(item) =>
			item.requiredPermissions.length === 0 ||
			item.requiredPermissions.every((key) => allowedPermissions.has(key)),
	);
}

export function getRailItemsForPath(
	pathname: string,
	options?: RailPermissionOptions,
): AppRouteMetadata[] {
	const scope = getShellScope(pathname);
	if (!scope) {
		return [];
	}

	const items = getRailItems(scope);
	const allowed = options?.allowedPermissions;
	if (!allowed) {
		return items;
	}

	return filterRailItemsByPermissions(items, allowed);
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
 * `matchExact` narrows a nested row (e.g. the account Profile row) to an
 * exact pathname match so it does not stay lit on its children's routes.
 */
export function isSecondaryPanelItemActive(
	item: SecondaryPanelItem,
	pathname: string,
	search: Record<string, unknown>,
): boolean {
	const matchesPath = item.matchExact
		? pathname === item.path
		: isPathPrefix(pathname, item.path);
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
