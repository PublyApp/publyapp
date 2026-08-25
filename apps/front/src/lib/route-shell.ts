export type ShellRouteMatch = {
	/**
	 * Flag @tanstack/router-core >= 1.171 sets on the match that owns the
	 * global not-found render (replaces the pre-1.171 `globalNotFound`).
	 */
	_notFound?: boolean;
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
		!matches.some((match) => match._notFound) &&
		matches.some((match) => match.routeId === AUTHED_LAYOUT_ROUTE_ID) &&
		normalizePathname(deepestMatch?.pathname ?? '/') ===
			normalizePathname(pathname)
	);
};

/**
 * Only the exact `/tenant` portal root renders bare: the org picker is its
 * own SimpleLayout surface and must never sit inside AppShell chrome. Every
 * `/tenant/*` CHILD path renders inside the AppShell (rail + topbar +
 * logout, whose tenant metadata `TENANT_ROUTES` supplies the rail); an
 * unresolved child path redirects to `/tenant` (see `TenantPortalRoute`),
 * so the picker stays the single unresolved surface and the AppShell never
 * wraps it.
 */
export const isTenantPortalPath = (pathname: string): boolean =>
	normalizePathname(pathname) === '/tenant';
