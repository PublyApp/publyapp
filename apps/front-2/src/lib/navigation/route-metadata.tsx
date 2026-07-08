import {
	BarChart3,
	Building2,
	ClipboardList,
	History,
	KeyRound,
	LayoutDashboard,
	Lock,
	Mail,
	Newspaper,
	ShieldCheck,
	UserRound,
	UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type ShellDisplayMode = 'default' | 'full-detail';

export type BreadcrumbItem = {
	label: string;
	path?: string;
};

export type SecondaryPanelItem = {
	label: string;
	description: string;
	path: string;
	Icon: LucideIcon;
	count?: number;
};

export type RouteId =
	| 'dashboard'
	| 'content'
	| 'staff-users'
	| 'roles-permissions'
	| 'invitations'
	| 'analytics'
	| 'tenants'
	| 'profiles';

export type AppRouteMetadata = {
	id: RouteId;
	label: string;
	path: string;
	Icon: LucideIcon;
	match: (pathname: string) => boolean;
	secondaryItems: SecondaryPanelItem[];
};

// -- Private prefix helpers
// Keep in sync with the prefix arrays passed to matchPath() below.

type PrefixEntry = {
	id: AppRouteMetadata['id'];
	prefixes: string[];
};

const ROUTE_PREFIX_ENTRIES: PrefixEntry[] = [
	{ id: 'staff-users', prefixes: ['/staff/staff-users', '/staff/invitations'] },
	{ id: 'profiles', prefixes: ['/staff/profiles'] },
	{ id: 'tenants', prefixes: ['/staff/tenants', '/tenant'] },
];

function getMatchedPrefix(
	pathname: string,
): { id: AppRouteMetadata['id']; prefix: string } | undefined {
	for (const entry of ROUTE_PREFIX_ENTRIES) {
		for (const prefix of entry.prefixes) {
			if (pathname === prefix || pathname.startsWith(prefix + '/')) {
				return { id: entry.id, prefix };
			}
		}
	}
	return undefined;
}

function matchPath(prefixes: string[]): (pathname: string) => boolean {
	return (pathname: string) =>
		prefixes.some(
			(prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
		);
}

// -- Create route detection (patterns, not just exact strings)

function isCreateRoute(pathname: string): boolean {
	return (
		pathname === '/staff/tenants/new' ||
		pathname === '/staff/profiles/new' ||
		pathname === '/staff/invitations/new' ||
		/^\/staff\/tenants\/[^/]+\/profiles\/new$/.test(pathname) ||
		/^\/staff\/tenants\/[^/]+\/users\/invite$/.test(pathname)
	);
}

// -- Primary route definitions

const STAFF_SECONDARY_ITEMS: SecondaryPanelItem[] = [
	{
		label: 'All users',
		description: '',
		path: '/staff/staff-users',
		Icon: UserRound,
		count: 42,
	},
	{
		label: 'Invitations',
		description: '',
		path: '/staff/invitations',
		Icon: Mail,
		count: 6,
	},
	{
		label: 'Roles',
		description: '',
		path: '/staff/profiles',
		Icon: KeyRound,
		count: 5,
	},
	{
		label: 'Profiles',
		description: '',
		path: '/staff/profiles',
		Icon: ClipboardList,
		count: 4,
	},
	{
		label: 'Permissions',
		description: '',
		path: '/staff/profiles',
		Icon: ShieldCheck,
		count: 86,
	},
	{
		label: 'Audit log',
		description: '',
		path: '/staff/staff-users',
		Icon: History,
	},
];

export const PRIMARY_APP_ROUTES: AppRouteMetadata[] = [
	{
		id: 'dashboard',
		label: 'Dashboard',
		path: '/staff/staff-users',
		Icon: LayoutDashboard,
		match: matchPath(['/staff/dashboard']),
		secondaryItems: [],
	},
	{
		id: 'content',
		label: 'Content',
		path: '/staff/staff-users',
		Icon: Newspaper,
		match: matchPath(['/staff/content']),
		secondaryItems: [],
	},
	{
		id: 'staff-users',
		label: 'Staff users',
		path: '/staff/staff-users',
		Icon: UsersRound,
		match: matchPath(['/staff/staff-users']),
		secondaryItems: STAFF_SECONDARY_ITEMS,
	},
	{
		id: 'roles-permissions',
		label: 'Roles & permissions',
		path: '/staff/profiles',
		Icon: Lock,
		match: matchPath(['/staff/roles-permissions', '/staff/profiles']),
		secondaryItems: [],
	},
	{
		id: 'invitations',
		label: 'Invitations',
		path: '/staff/invitations',
		Icon: Mail,
		match: matchPath(['/staff/invitations']),
		secondaryItems: [],
	},
	{
		id: 'analytics',
		label: 'Analytics',
		path: '/staff/staff-users',
		Icon: BarChart3,
		match: matchPath(['/staff/analytics']),
		secondaryItems: [],
	},
	// Hidden — kept for backward-compatible route matching (tenants/tenant prefix)
	{
		id: 'tenants',
		label: 'Tenants',
		path: '/staff/tenants',
		Icon: Building2,
		match: matchPath(['/staff/tenants', '/tenant']),
		secondaryItems: [],
	},
];

// -- Public API

const VISIBLE_PRIMARY_ROUTE_IDS: AppRouteMetadata['id'][] = [
	'dashboard',
	'content',
	'staff-users',
	'roles-permissions',
	'invitations',
	'analytics',
];

export function getVisiblePrimaryRoutes(): AppRouteMetadata[] {
	return PRIMARY_APP_ROUTES.filter((r) =>
		VISIBLE_PRIMARY_ROUTE_IDS.includes(r.id),
	);
}

export function getStaffSecondaryItems(): SecondaryPanelItem[] {
	return STAFF_SECONDARY_ITEMS;
}

export function getActiveAppRoute(
	pathname: string,
): AppRouteMetadata | undefined {
	return PRIMARY_APP_ROUTES.find((route) => route.match(pathname));
}

function isDetailPath(pathname: string): boolean {
	if (isCreateRoute(pathname)) {
		return false;
	}

	const matched = getMatchedPrefix(pathname);
	if (!matched) {
		return false;
	}

	return pathname.length > matched.prefix.length;
}

export function getShellDisplayMode(pathname: string): ShellDisplayMode {
	return isDetailPath(pathname) ? 'full-detail' : 'default';
}

const PREFIX_DETAIL_LABELS: Record<string, string> = {
	'/staff/staff-users': 'User detail',
	'/staff/invitations': 'Invitation detail',
	'/staff/profiles': 'Profile detail',
	'/staff/tenants': 'Tenant detail',
	'/tenant': 'Tenant detail',
};

export function getBreadcrumbsForPath(pathname: string): BreadcrumbItem[] {
	const route = getActiveAppRoute(pathname);

	if (!route) {
		return [{ label: 'Workspace', path: '/staff/staff-users' }];
	}

	const breadcrumbs: BreadcrumbItem[] = [
		{ label: 'Workspace', path: route.path },
		{ label: route.label, path: route.path },
	];

	if (isDetailPath(pathname)) {
		const matched = getMatchedPrefix(pathname);
		if (matched) {
			const detailLabel = PREFIX_DETAIL_LABELS[matched.prefix];
			if (detailLabel) {
				breadcrumbs.push({ label: detailLabel });
			}
		}
	}

	return breadcrumbs;
}
