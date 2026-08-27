import { redirect } from '@tanstack/react-router';

import { selectToken } from '@org/shared-ts/lib/session/parse';

import { getSessionTokensFromBrowser } from './api-client/client-manager';
import { resolveWorkspacePath } from './server/session-actions';

export const hasBrowserSessionCookie = (): boolean => {
	const tokens = getSessionTokensFromBrowser();
	return Boolean(selectToken(tokens, 'tenant') || tokens.staffToken);
};

/**
 * Resolves the workspace an authenticated session belongs to, reusing the
 * same server-side scope resolution as a fresh login — via the read-only
 * `resolveWorkspacePath`, which never touches the session cookie (unlike
 * `completeLoginRedirect`, which needs `sessionExpiresAt` to reissue it
 * correctly and would otherwise downgrade a persistent cookie to a
 * session-only one on every guard call — see F9). Returns undefined for
 * every non-success case (no session, stale/invalid token, unauthorized
 * scope, or the API being unreachable) so callers can treat "no target" as
 * "let the page render" without inspecting the error themselves.
 */
const resolveAuthenticatedWorkspacePath = async (): Promise<
	string | undefined
> => {
	try {
		const result = await resolveWorkspacePath();
		return result.targetPath;
	} catch {
		return undefined;
	}
};

/**
 * Route guard for auth pages (login, and future signup/reset-password/
 * accept-invitation screens): sends already-authenticated visitors to their
 * workspace instead of letting them sit on an auth form. Attach as-is to a
 * route's `beforeLoad` so it blocks render on both the SSR and CSR paths —
 * no post-paint redirect flash.
 *
 * The `typeof document` check is a browser-only fast path: it skips the
 * resolver call entirely when there is plainly no session cookie, so the
 * anonymous flow (the common case for every auth page) never pays for the
 * extra round trip. On the server (SSR) there is no `document`, so this
 * always defers to the resolver, which reads the request cookie directly.
 *
 * To re-run this guard against an already-mounted route (e.g. after a
 * cross-tab session change), call `router.invalidate()` — TanStack Router
 * re-runs `beforeLoad` for the current match.
 */
export const redirectAuthenticatedUserAwayFromAuthPage =
	async (): Promise<void> => {
		if (typeof document !== 'undefined' && !hasBrowserSessionCookie()) {
			return;
		}

		const targetPath = await resolveAuthenticatedWorkspacePath();
		if (!targetPath) {
			return;
		}

		throw redirect({ to: targetPath, replace: true });
	};
