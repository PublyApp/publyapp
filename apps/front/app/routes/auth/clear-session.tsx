import { redirect } from 'react-router';

import { createClearSessionCookieHeaders } from '@/front/lib/cookies/server-cookie.utils';
import { getServerAction } from '@/front/lib/react-router/server-data.server';
import {
	FRONT_PATH_NAMES,
	formActionKey,
	queryParamKey,
} from '@/shared/lib/constants';
import { logger } from '@/shared/lib/logger/iso-logger';

/**
 * Dedicated route for clearing httpOnly session cookies.
 *
 * This route only has an action (no loader or component) and is used when
 * the client detects an httpOnly cookie mismatch - where the server can see
 * a session cookie but JavaScript cannot read it.
 *
 * Security measures:
 * - POST-only: Prevents link-based logout attacks (GET requests don't trigger actions)
 * - Origin validation: Rejects cross-origin requests to prevent CSRF form submissions
 */
export const action = getServerAction({
	action: async ({ request }) => {
		// Validate request origin to prevent cross-site form submissions
		const origin = request.headers.get('Origin');
		const secFetchSite = request.headers.get('Sec-Fetch-Site');
		const requestUrl = new URL(request.url);

		const allowedFetchSites = ['same-origin', 'same-site', 'none'] as const;

		const isAllowedSecFetchSite = (value: string): boolean => {
			return allowedFetchSites.includes(value as never);
		};

		const isSameOrigin = (originValue: string): boolean => {
			try {
				return new URL(originValue).host === requestUrl.host;
			} catch {
				return false;
			}
		};

		// Prefer Origin when present; fall back to Fetch Metadata; if both are missing, reject.
		// This blocks cross-site form posts that attempt to clear cookies (logout CSRF vector).
		if (origin) {
			if (!isSameOrigin(origin)) {
				logger.warn('[clear-session action] Rejected cross-origin request', {
					origin,
					host: requestUrl.host,
				});
				return redirect(FRONT_PATH_NAMES.auth.login);
			}
		} else if (secFetchSite) {
			if (!isAllowedSecFetchSite(secFetchSite)) {
				logger.warn('[clear-session action] Rejected cross-site request', {
					secFetchSite,
				});
				return redirect(FRONT_PATH_NAMES.auth.login);
			}
		} else {
			logger.warn(
				'[clear-session action] Rejected request with no Origin and no Sec-Fetch-Site',
				{
					host: requestUrl.host,
				},
			);
			return redirect(FRONT_PATH_NAMES.auth.login);
		}

		const formData = await request.formData();
		const actionType = formData.get('action');
		const redirectCause = formData.get(queryParamKey.login_page.redirect_cause);

		logger.debug('[clear-session action] Action called', {
			actionType,
			redirectCause,
		});

		// Build login URL with optional redirect_cause
		const buildLoginUrl = () => {
			if (redirectCause && typeof redirectCause === 'string') {
				const url = new URL(FRONT_PATH_NAMES.auth.login, requestUrl.origin);
				url.searchParams.set(
					queryParamKey.login_page.redirect_cause,
					redirectCause,
				);
				return url.pathname + url.search;
			}
			return FRONT_PATH_NAMES.auth.login;
		};

		if (actionType === formActionKey.clear_httponly_session) {
			const clearHeaders = createClearSessionCookieHeaders();

			logger.info('[clear-session action] Clearing session cookie');

			// Redirect to login with Set-Cookie headers to clear the cookie
			return redirect(buildLoginUrl(), {
				headers: clearHeaders,
			});
		}

		// Invalid action - redirect to login
		logger.debug(
			'[clear-session action] No action taken, redirecting to login',
		);
		return redirect(buildLoginUrl());
	},
});
