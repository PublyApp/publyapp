import type { LucideIcon } from 'lucide-react';
import {
	Building2,
	ClipboardList,
	KeyRound,
	ShieldCheck,
	UserRound,
	UsersRound,
} from 'lucide-react';

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
};

export type AppRouteMetadata = {
	id: 'staff-users' | 'profiles' | 'tenants';
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

export const PRIMARY_APP_ROUTES: AppRouteMetadata[] = [
	{
		id: 'staff-users',
		label: 'Staff users',
		path: '/staff/staff-users',
		Icon: UsersRound,
		match: matchPath(['/staff/staff-users', '/staff/invitations']),
		secondaryItems: [
			{
				label: 'All staff users',
				description: 'Search, sort, select, and inspect staff accounts.',
				path: '/staff/staff-users',
				Icon: UserRound,
			},
			{
				label: 'Invitations',
				description: 'Review pending staff invitations.',
				path: '/staff/invitations',
				Icon: KeyRound,
			},
		],
	},
	{
		id: 'profiles',
		label: 'Profiles',
		path: '/staff/profiles',
		Icon: ShieldCheck,
		match: matchPath(['/staff/profiles']),
		secondaryItems: [
			{
				label: 'All profiles',
				description: 'Manage reusable staff permission profiles.',
				path: '/staff/profiles',
				Icon: ClipboardList,
			},
		],
	},
	{
		id: 'tenants',
		label: 'Tenants',
		path: '/staff/tenants',
		Icon: Building2,
		match: matchPath(['/staff/tenants', '/tenant']),
		secondaryItems: [
			{
				label: 'Tenant directory',
				description:
					'Inspect tenant lifecycle, users, profiles, and invitations.',
				path: '/staff/tenants',
				Icon: Building2,
			},
		],
	},
];

// -- Public API

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
