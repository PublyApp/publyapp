export type ShellRouteMatch = {
	globalNotFound?: boolean;
	pathname?: string;
	routeId?: string;
};

const AUTHED_LAYOUT_ROUTE_ID = '/_authed-layout';

const normalizePathname = (pathname: string): string =>
	pathname.replace(/\/+$/, '') || '/';

export const hasExactAuthedRouteMatch = (
	matches: readonly ShellRouteMatch[],
	pathname: string,
): boolean => {
	const deepestMatch = matches[matches.length - 1];

	return (
		!matches.some((match) => match.globalNotFound) &&
		matches.some((match) => match.routeId === AUTHED_LAYOUT_ROUTE_ID) &&
		normalizePathname(deepestMatch?.pathname ?? '/') ===
			normalizePathname(pathname)
	);
};

/**
 * Every `/tenant` path — the portal root (org picker) and the whole
 * workspace subtree beneath it — renders bare: the picker is its own
 * SimpleLayout surface, and the resolved workspace shell owns the chrome
 * from inside the tenant route. The AppShell must be bypassed for the ENTIRE
 * subtree (not just the exact `/tenant` path), or an unresolved child path
 * like `/tenant/account` paints AppShell chrome around the picker (PR #1131
 * round 3 finding 1).
 */
export const isTenantPortalPath = (pathname: string): boolean =>
	pathname === '/tenant' || pathname.startsWith('/tenant/');
