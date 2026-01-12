import { ClientManager } from '@/front/lib/js-client/client-manager';
import { getQueryClient } from '@/front/lib/react-query/query-client';
import { globalNavigate } from '@/front/lib/react-router/navigation-helper';
import {
	FRONT_PATH_NAMES,
	formActionKey,
	queryParamKey,
	queryParamValue,
} from '@/shared/lib/constants';

import { clearSessionCookie } from './session-cookie.utils';

type LogoutOptions = {
	/**
	 * Whether to include a redirect cause parameter for the login page.
	 * - 'invalid_session': Shows message about session expiration (used for auto-logout on 401)
	 * - undefined: No message (used for user-initiated logout)
	 */
	redirectCause?: 'invalid_session';
};

/**
 * Clears session state and redirects to login.
 * - Clears non-httpOnly session cookies
 * - Clears TanStack Query cache
 * - Uses fetch to clear httpOnly cookies (Set-Cookie headers are processed)
 * - Navigates to login page
 */
export const logout = (options?: LogoutOptions): void => {
	// Clear session cookie (non-httpOnly only)
	clearSessionCookie();

	// Clear entire react-query cache (queries + mutations)
	getQueryClient().clear();

	// Clear cached API clients and reset singleton (ensures clean state for next user)
	ClientManager.create().clearClients();
	ClientManager.resetInstance();

	// Build login URL with optional redirect_cause
	const loginUrl = new URL(FRONT_PATH_NAMES.auth.login, window.location.origin);
	if (options?.redirectCause === 'invalid_session') {
		loginUrl.searchParams.set(
			queryParamKey.login_page.redirect_cause,
			queryParamValue.login_page.redirect_cause.invalid_session,
		);
	}

	// Build form data for the clear-session request
	const formData = new FormData();
	formData.append('action', formActionKey.clear_httponly_session);
	if (options?.redirectCause === 'invalid_session') {
		formData.append(
			queryParamKey.login_page.redirect_cause,
			queryParamValue.login_page.redirect_cause.invalid_session,
		);
	}

	// Use fetch to clear httpOnly cookies
	// Set-Cookie headers from the response are processed by the browser
	// POST + Origin header provides CSRF protection
	fetch(FRONT_PATH_NAMES.auth.clearSession, {
		method: 'POST',
		credentials: 'include',
		redirect: 'manual', // prevent automatic redirect to login page
		body: formData,
	})
		.catch(() => {
			// Ignore fetch errors - navigate to login regardless
		})
		.finally(() => {
			// Navigate to login page using React Router (no page reload)
			// Use replace to prevent back-button returning to protected page
			globalNavigate(loginUrl.pathname + loginUrl.search, { replace: true });
		});
};
