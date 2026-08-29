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

type SecondaryPanelItemSearch = {
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

type RouteId =
	| 'dashboard'
	| 'tenants'
	| 'staff'
	| 'account'
	| 'settings'
	| 'posts'
	| 'organizations';

/**
 * Who may see this rail entry. Declaring it is MANDATORY: an entry cannot
 * omit it, so "visible to everyone" must be written as `public` rather than
 * implied by an absent field. This closes the #1629 default — a forgotten
 * declaration now fails compilation (or the visibility contract test) instead
 * of silently producing an always-visible entry.
 *
 * - `'public'` — the entry is legitimately open to every signed-in member of
 *   the scope (e.g. the personal `Account` rail, which every member owns).
 *   No permission key applies. This is the ONLY way to express "no gate".
 * - `'permission-gated'` — the entry requires every key in
 *   `requiredPermissions`. Hiding is UI-convenience ONLY; the server
 *   independently enforces each gate behind those keys (#142).
 *
 * The two values are expressed as literal discriminants on `AppRouteMetadata`
 * (see the `visibility` field of each union variant); the standalone
 * `RailVisibility` alias is intentionally dropped so an incoherent entry
 * cannot be described by a name that hides the coupling to `requiredPermissions`.
 */

type RailItemBase = {
	id: RouteId;
	labelKey: string;
	scope: ShellScope;
	path: AppRoutePath;
	Icon: TablerIcon;
	matchPrefixes: string[];
	secondaryItems: SecondaryPanelItem[];
};

/**
 * A rail entry is one of two mutually-exclusive shapes, discriminated by
 * `visibility`. The union makes an INCOHERENT entry unexpressible (#1633):
 *
 * - `'public'` — open to every signed-in member of the scope. It carries NO
 *   permission keys (`requiredPermissions` is the empty tuple `readonly []`),
 *   so there is nothing to grant and the entry can never silently hide a gate
 *   behind an ignored list.
 * - `'permission-gated'` — requires every key in `requiredPermissions`, which
 *   MUST be non-empty (`readonly [string, ...string[]]`). An empty list would
 *   vacuously satisfy "all required keys are granted" and render as visible to
 *   everyone while declaring itself barred, so the type forbids it outright.
 *
 * A `public` entry with keys, or a `permission-gated` entry with an empty
 * list, cannot be written — the #1633 incoherence is closed at the type level,
 * not by a test that might happen to share the same dataset. Declaring
 * `visibility` stays MANDATORY; `requiredPermissions` stays present on both
 * variants so the filter and the contract tests keep reading it uniformly.
 */
export type AppRouteMetadata =
	| (RailItemBase & {
			/** Open to every member of the scope; MUST NOT declare any permission. */
			visibility: 'public';
			requiredPermissions: readonly [];
	  })
	| (RailItemBase & {
			/** Requires every key below; the list MUST be non-empty. */
			visibility: 'permission-gated';
			/**
			 * Permission keys (from the scope-auth-data `permissions` list) the
			 * signed-in user must hold for this entry to render. MUST mirror a gate
			 * the API enforces server-side on the underlying surface (#142). Hiding a
			 * menu entry is convenience, NOT authorization.
			 */
			requiredPermissions: readonly [string, ...string[]];
	  });

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
		// unconditioned until a staff permission taxonomy exists (#142). Every
		// signed-in member of the staff scope may see it, so it is 'public'.
		visibility: 'public',
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
		visibility: 'public',
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
		visibility: 'public',
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
		// own profile, so no permission key applies. 'public' is the ONLY way to
		// express "no gate" (#1629): a forgotten declaration must not fall back
		// to visible-by-default.
		visibility: 'public',
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
		visibility: 'permission-gated',
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
		visibility: 'permission-gated',
		requiredPermissions: ['tenant.posts.view'],
	},
];

const isPathPrefix = (pathname: string, prefix: string): boolean =>
	pathname === prefix || pathname.startsWith(`${prefix}/`);

const matchPath = (pathname: string, prefixes: string[]): boolean =>
	prefixes.some((prefix) => isPathPrefix(pathname, prefix));

export const getShellScope = (pathname: string): ShellScope | undefined => {
	if (isPathPrefix(pathname, '/staff')) {
		return 'staff';
	}

	if (isPathPrefix(pathname, '/tenant')) {
		return 'tenant';
	}

	return undefined;
};

export const getRailItems = (scope: ShellScope): AppRouteMetadata[] => {
	if (scope === 'staff') {
		return STAFF_ROUTES;
	}
	return TENANT_ROUTES;
};

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
 * Keeps only the entries visible to the signed-in user. An entry is visible
 * when its `visibility` is `'public'` (legitimately open to every member of
 * the scope) or when `visibility` is `'permission-gated'` AND every key in
 * `requiredPermissions` is granted. An entry with no declared visibility can
 * never reach here (#1629: omission is a compile/contract error, never
 * "visible by default"). This is a UI-convenience filter ONLY; the server
 * independently enforces every gate behind these keys (#142).
 */
export const filterRailItemsByPermissions = (
	items: AppRouteMetadata[],
	allowedPermissions: Set<string>,
): AppRouteMetadata[] => {
	// "*" is the backend's Admin sentinel (materialised by user-auth-data for
	// AccountLevel.Admin and honoured by TenantPermissionFilter): an admin
	// passes every gate, so every rail entry stays visible.
	if (allowedPermissions.has('*')) {
		return items;
	}
	return items.filter(
		(item) =>
			item.visibility === 'public' ||
			(item.visibility === 'permission-gated' &&
				item.requiredPermissions.every((key) => allowedPermissions.has(key))),
	);
};

export const getRailItemsForPath = (
	pathname: string,
	options?: RailPermissionOptions,
): AppRouteMetadata[] => {
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
};

const getActiveAppRoute = (pathname: string): AppRouteMetadata | undefined => {
	const scope = getShellScope(pathname);
	if (!scope) {
		return undefined;
	}

	return getRailItems(scope)
		.filter((route) => matchPath(pathname, route.matchPrefixes))
		.sort((a, b) => b.path.length - a.path.length)[0];
};

export const getActiveRailItem = (
	pathname: string,
): AppRouteMetadata | undefined => {
	return getActiveAppRoute(pathname);
};

export const getSecondaryPanelItems = (
	pathname: string,
): SecondaryPanelItem[] => {
	return getActiveRailItem(pathname)?.secondaryItems ?? [];
};

/**
 * A panel item is active when its pathname matches AND its declared search
 * (e.g. a status filter) matches the current search — so "All tenants" (no
 * search) and "Active" (status=active) never both light up for the same URL.
 * `matchExact` narrows a nested row (e.g. the account Profile row) to an
 * exact pathname match so it does not stay lit on its children's routes.
 */
export const isSecondaryPanelItemActive = (
	item: SecondaryPanelItem,
	pathname: string,
	search: Record<string, unknown>,
): boolean => {
	const matchesPath = item.matchExact
		? pathname === item.path
		: isPathPrefix(pathname, item.path);
	const itemStatus = item.search?.status;
	const currentStatus =
		typeof search.status === 'string' ? search.status : undefined;

	return matchesPath && itemStatus === currentStatus;
};

export const shouldShowSecondaryPanel = (
	pathname: string,
	options?: {
		sidebarOpen?: boolean;
		viewportWidth?: number;
	},
): boolean => {
	const activeItems = getSecondaryPanelItems(pathname);
	const viewportWidth = options?.viewportWidth ?? Number.POSITIVE_INFINITY;
	const panelOpen = options?.sidebarOpen ?? true;

	return panelOpen && viewportWidth >= 1024 && activeItems.length >= 2;
};
