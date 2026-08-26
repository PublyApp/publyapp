import { queryParamKey } from '@org/shared-ts/lib/constants';

// `/\evil.com` isn't rejected by a bare `//` check: the WHATWG URL parser
// treats a leading backslash as a path separator for special schemes, so
// `history.pushState`/`navigate({ to })` would resolve it to host
// `evil.com`. Reject any path containing a backslash, or any character
// outside a conservative allowlist, rather than trying to enumerate every
// parser quirk.
// eslint-disable-next-line no-control-regex -- deliberately rejecting control characters
const CONTROL_CHARACTER_PATTERN = /[\x00-\x1f]/;

const isSafeRelativePath = (path: string): boolean =>
	/^\/[^/\\][^\\]*$/.test(path) && !CONTROL_CHARACTER_PATTERN.test(path);

/**
 * Falls back to `/` for anything that isn't an internal relative path —
 * shared by `login.tsx`'s own `redirect_to` query param and `useLogout`'s
 * `redirectTo` option (review-r3-users-auth.md F14), so a caller passing an
 * untrusted value can't navigate off-origin.
 */
export const resolveRouteRedirect = (path: string | null): string => {
	if (!path) {
		return '/';
	}

	if (!isSafeRelativePath(path)) {
		return '/';
	}

	return path;
};

export const getSafeSearchRedirect = (search: string): string => {
	const params = new URLSearchParams(search);
	return resolveRouteRedirect(params.get(queryParamKey.login_page.redirect_to));
};

/**
 * Auth-surface routes that a redirect_to may legitimately point back at even
 * though they aren't under the resolved workspace surface — e.g. an
 * invitation link's `/accept-invitation?id=…&token=…`, which the user must
 * return to after signing in for the invitation to actually get accepted
 * (see F4). Compared against the path only; the query string is stripped
 * before matching.
 */
const RETURNABLE_AUTH_PATHS = ['/accept-invitation'];

export const isAllowedRedirectPath = (
	requested: string,
	surfacePath: string,
): boolean => {
	if (!requested || !isSafeRelativePath(requested)) {
		return false;
	}

	const requestedPath = requested.split('?')[0] ?? requested;
	if (RETURNABLE_AUTH_PATHS.includes(requestedPath)) {
		return true;
	}

	const normalizedSurface = surfacePath.replace(/\/$/, '');
	if (requestedPath === normalizedSurface) {
		return true;
	}

	return requestedPath.startsWith(`${normalizedSurface}/`);
};
