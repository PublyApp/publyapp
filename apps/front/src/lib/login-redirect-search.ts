import { queryParamKey, queryParamValue } from '@org/shared-ts/lib/constants';

type BuildLoginRedirectSearchArgs = {
	/**
	 * Only claim the session expired (the "Sign in to pick up where you left
	 * off." banner) when a session actually existed — a first-time visitor
	 * bouncing off an authed route deep link never had one.
	 */
	hadSession: boolean;
	/**
	 * Path (+ query string) to carry through as `rto` so `/login` can return
	 * the user to where they were (`isAllowedRedirectPath` already validates
	 * and consumes it).
	 */
	returnTo?: string;
};

/**
 * Single source for the search params attached to every authed→login
 * bounce, so `rc` and `rto` are never built ad hoc per call site and drift
 * out of sync (shell r2-F2 / users-auth r2-F4).
 */
export const buildLoginRedirectSearch = ({
	hadSession,
	returnTo,
}: BuildLoginRedirectSearchArgs) => {
	const result: Record<string, string> = {};
	if (hadSession) {
		result[queryParamKey.login_page.redirect_cause] =
			queryParamValue.login_page.redirect_cause.invalid_session;
	}
	if (returnTo) {
		result[queryParamKey.login_page.redirect_to] = returnTo;
	}
	return result;
};
