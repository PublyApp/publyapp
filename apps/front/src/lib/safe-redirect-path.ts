import { queryParamKey } from '@org/shared-ts/lib/constants';

// `/\evil.com` isn't rejected by a bare `//` check: the WHATWG URL parser
// treats a leading backslash as a path separator for special schemes, so
// `history.pushState`/`navigate({ to })` would resolve it to host
// `evil.com`. Reject any path containing a backslash, or any character
// outside a conservative allowlist, rather than trying to enumerate every
// parser quirk.
// eslint-disable-next-line no-control-regex -- deliberately rejecting control characters
const CONTROL_CHARACTER_PATTERN = /[\x00-\x1f]/;

export const isSafeRelativePath = (path: string): boolean =>
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
