import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useCallback, useRef, useState } from 'react';
import { clearSession } from '~/lib/server/session-actions';
import {
	AUTH_SYNC_CHANNEL,
	postBroadcast,
} from '~/lib/tab-sync/broadcast-sync';

import { queryParamKey, queryParamValue } from '@org/shared-ts/lib/constants';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';

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
};

const buildLoginSearch = (redirectCause: LogoutOptions['redirectCause']) => {
	if (!redirectCause) {
		return undefined;
	}

	return {
		[queryParamKey.login_page.redirect_cause]:
			queryParamValue.login_page.redirect_cause[redirectCause],
	};
};

export const useLogout = () => {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const clear = useServerFn(clearSession);
	const [isLoggingOut, setIsLoggingOut] = useState(false);
	const isInFlightRef = useRef(false);

	const logout = useCallback(
		(options?: LogoutOptions) => {
			if (isInFlightRef.current) {
				return;
			}

			isInFlightRef.current = true;
			setIsLoggingOut(true);

			queryClient.clear();
			clear()
				.then(() => {
					// Broadcast only after the clear settles — the shared session
					// cookie is guaranteed cleared by then, so other tabs never
					// race the sender to /login while still authenticated.
					postBroadcast(AUTH_SYNC_CHANNEL, { type: 'logout' });

					if (options?.redirectTo) {
						void navigate({ to: options.redirectTo, replace: true });
						return;
					}

					void navigate({
						to: '/login',
						search: buildLoginSearch(options?.redirectCause),
						replace: true,
					});
				})
				.catch((error: unknown) => {
					// Don't navigate on a failed clear — the session cookie is
					// still there, so the auth-page guard would immediately
					// bounce the user back to their workspace, making "Log out"
					// look like it silently did nothing.
					logger.error('logout: failed to clear the server session', error);
					isInFlightRef.current = false;
					setIsLoggingOut(false);
				});
		},
		[clear, navigate, queryClient],
	);

	return { logout, isLoggingOut };
};
