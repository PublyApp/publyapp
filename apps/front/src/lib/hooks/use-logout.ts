import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useCallback, useState } from 'react';
import { clearSelectedTenantId } from '~/lib/selected-tenant-storage';
import { clearSession } from '~/lib/server/session-actions';
import {
	AUTH_SYNC_CHANNEL,
	postBroadcast,
} from '~/lib/tab-sync/broadcast-sync';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import { buildLoginRedirectSearch } from '@org/shared-ts/lib/login-redirect-search';
import { resolveRouteRedirect } from '@org/shared-ts/lib/safe-redirect-path';

type LogoutOptions = {
	/**
	 * 'invalid_session' shows the session-expired banner on the login page —
	 * only the auto-logout-on-401 path (LogoutRedirect) passes this.
	 * User-initiated logout omits it.
	 */
	redirectCause?: 'invalid_session';
	/**
	 * Overrides the post-logout destination (default '/login') — used by the
	 * accept-invitation "Not you?" and wrong-account flows, which log out and
	 * stay on (or return to) the invitation link instead of landing on login.
	 * Mutually exclusive with redirectCause in practice: a caller passing a
	 * custom target never wants the session-expired banner.
	 */
	redirectTo?: string;
	/**
	 * The authed path (+ query string) the user was bounced from — carried
	 * through as `rto` so `/login` can return them to it after signing back
	 * in (see `login.tsx`'s `isAllowedRedirectPath`). Only meaningful
	 * alongside `redirectCause`; irrelevant when `redirectTo` overrides the
	 * destination outright.
	 */
	returnTo?: string;
};

const buildLoginSearch = (
	redirectCause: LogoutOptions['redirectCause'],
	returnTo: LogoutOptions['returnTo'],
) => {
	const search = buildLoginRedirectSearch({
		hadSession: redirectCause === 'invalid_session',
		returnTo,
	});

	if (Object.keys(search).length > 0) return search;
	return undefined;
};

/**
 * Module-level, not a per-hook ref: the same 401 can independently reach
 * `logout()` from more than one mounted `useLogout()` instance at once — e.g.
 * `router.tsx`'s `QueryCache`/`MutationCache` backstop (via `__root.tsx`'s
 * `SessionInvalidationListener`) and `authed/layout.tsx`'s `<LogoutRedirect />`
 * both react to the same authed-surface 401. A `useRef` guard only dedupes
 * re-entrancy within ONE hook instance, so the second instance would still
 * run the full clear+broadcast+navigate sequence a second time (observed as
 * `/auth/redirect-code` firing twice). Sharing this flag across every
 * instance — the same pattern as `session-invalidation-channel.ts`'s shared
 * listener set — makes any concurrent second call a true no-op. Reset once
 * the in-flight attempt settles (success or failure) so a later, unrelated
 * logout (e.g. after logging back in) is never permanently blocked.
 */
let logoutInFlight = false;

/**
 * Test-only escape hatch: resets the shared module-level guard so vitest
 * runs sharing a worker don't leak an in-flight flag from one test file's
 * unresolved logout into the next file's first logout attempt.
 */
export const __resetLogoutInFlightForTests = () => {
	logoutInFlight = false;
};

export const useLogout = () => {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const clear = useServerFn(clearSession);
	const [isLoggingOut, setIsLoggingOut] = useState(false);

	const logout = useCallback(
		(options?: LogoutOptions) => {
			if (logoutInFlight) {
				return;
			}

			logoutInFlight = true;
			setIsLoggingOut(true);

			clear()
				.then(() => {
					// Drop the persisted tenant selection together with the
					// session: localStorage is origin-wide, so one removal
					// clears it for every tab on this browser. Without it, the
					// next user of a shared browser who happens to share a
					// tenant silently lands in the previous user's workspace
					// instead of the picker (PR #1131 round 3 finding 2). A
					// UI preference only, like the session cookie that actually
					// authorizes requests — cleared here, after the server-side
					// clear settles, so a failed logout leaves it intact.
					clearSelectedTenantId();

					// Broadcast only after the clear settles — the shared session
					// cookie is guaranteed cleared by then, so other tabs never
					// race the sender to /login while still authenticated.
					postBroadcast(AUTH_SYNC_CHANNEL, { type: 'logout' });

					// Every current caller passes an internal value (accept-invitation's
					// `stayOnPageHref`/`loginHref`), so this is hardening rather than a
					// live-bug fix — routes it through the same validator `login.tsx`
					// already uses for its own redirect param, closing the open-redirect
					// surface an untrusted `redirectTo` would otherwise be (r3-users-auth
					// F14).
					// `ignoreBlocker: true` — a dirty-form nav-guard (useBlocker) must
					// never strand a user behind a confirmation dialog while the
					// session is already being torn down: a cross-tab logout, an
					// expired-session redirect, or the user's own "Log out" action
					// all have to win over an "unsaved changes" prompt.
					const navigation = options?.redirectTo
						? navigate({
								to: resolveRouteRedirect(options.redirectTo),
								replace: true,
								ignoreBlocker: true,
							})
						: navigate({
								to: '/login',
								search: buildLoginSearch(
									options?.redirectCause,
									options?.returnTo,
								),
								replace: true,
								ignoreBlocker: true,
							});

					// Clear the query cache only once navigation away from the
					// authed surface has been initiated — clearing it first makes
					// TanStack Query refetch still-mounted active queries against
					// the now-cleared session, firing a duplicate request before
					// the redirect takes effect (see 80a14aa5).
					return navigation.then(() => {
						queryClient.clear();
					});
				})
				.catch((error: unknown) => {
					// Don't navigate on a failed clear — the session cookie is
					// still there, so the auth-page guard would immediately
					// bounce the user back to their workspace, making "Log out"
					// look like it silently did nothing.
					logger.error('logout: failed to clear the server session', error);
					setIsLoggingOut(false);
				})
				.finally(() => {
					logoutInFlight = false;
				});
		},
		[clear, navigate, queryClient],
	);

	return { logout, isLoggingOut };
};
