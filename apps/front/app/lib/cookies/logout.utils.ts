import { clearSessionCookie } from './session-cookie.utils';

import { ClientManager } from '@/front/lib/js-client/client-manager';
import { defaultQueryClient } from '@/front/lib/react-query/query-client';
import {
	FRONT_PATH_NAMES,
	formActionKey,
	queryParamKey,
	queryParamValue,
} from '@/shared/lib/constants';

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
 * - Submits POST form to /auth/clear-session to clear httpOnly cookies
 */
export const logout = (options?: LogoutOptions): void => {
	// Clear session cookie (non-httpOnly only)
	clearSessionCookie();

	// Clear react-query cache
	defaultQueryClient.removeQueries();

	// Clear cached API clients (ensures clean state for next user)
	ClientManager.create().clearClients();

	// Submit form to clear-session route which will:
	// 1. Clear any httpOnly session cookie on the server
	// 2. Redirect to login page
	// POST + Origin validation on server prevents link-based logout attacks
	const form = document.createElement('form');
	form.method = 'POST';
	form.action = FRONT_PATH_NAMES.auth.clearSession;

	const actionInput = document.createElement('input');
	actionInput.type = 'hidden';
	actionInput.name = 'action';
	actionInput.value = formActionKey.clear_httponly_session;
	form.appendChild(actionInput);

	// Add redirect_cause if specified (for auto-logout on 401)
	if (options?.redirectCause === 'invalid_session') {
		const causeInput = document.createElement('input');
		causeInput.type = 'hidden';
		causeInput.name = queryParamKey.login_page.redirect_cause;
		causeInput.value =
			queryParamValue.login_page.redirect_cause.invalid_session;
		form.appendChild(causeInput);
	}

	document.body.appendChild(form);
	form.submit();
};
