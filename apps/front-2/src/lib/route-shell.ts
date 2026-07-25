export type ShellRouteMatch = {
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
		matches.some((match) => match.routeId === AUTHED_LAYOUT_ROUTE_ID) &&
		normalizePathname(deepestMatch?.pathname ?? '/') ===
			normalizePathname(pathname)
	);
};
