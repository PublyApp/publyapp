/**
 * The public, unauthenticated auth-surface routes (see `src/routes.ts`).
 * Single source of truth for "is this pathname an auth screen" — shared by
 * `__root.tsx`'s surface/error classification and `tab-sync-listener.tsx`'s
 * cross-tab login broadcast handling, so the two can never drift out of sync.
 */
const AUTH_PATHS = [
	'/login',
	'/signup',
	'/verify-email',
	'/reset-password',
	'/accept-invitation',
] as const;

const isPathForSurface = (pathname: string, surfacePath: string): boolean =>
	pathname === surfacePath || pathname.startsWith(`${surfacePath}/`);

export const isAuthPath = (pathname: string): boolean =>
	AUTH_PATHS.some((path) => isPathForSurface(pathname, path));
