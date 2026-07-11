import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useCallback, useRef, useState } from 'react';
import { clearSession } from '~/lib/server/session-actions';

import { queryParamKey, queryParamValue } from '@org/shared-ts/lib/constants';

type LogoutOptions = {
	/**
	 * 'invalid_session' shows the session-expired banner on the login page —
	 * only the auto-logout-on-401 path (LogoutRedirect) passes this.
	 * User-initiated logout omits it.
	 */
	redirectCause?: 'invalid_session';
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
			void clear().finally(() => {
				void navigate({
					to: '/login',
					search: buildLoginSearch(options?.redirectCause),
					replace: true,
				});
			});
		},
		[clear, navigate, queryClient],
	);

	return { logout, isLoggingOut };
};
