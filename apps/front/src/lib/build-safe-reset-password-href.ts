import { queryParamKey, queryParamValue } from '@org/shared-ts/lib/constants';

/**
 * The API returns an absolute resetPasswordUrl built from its own configured
 * front-end origin. Rather than trust that host, only the id/token pair is
 * reused — the target path is always our own /reset-password route, so a
 * tampered or unexpected host in the response can never redirect off-site.
 */
export const buildSafeResetPasswordHref = (
	rawUrl: string | undefined,
): string => {
	const fallback = '/reset-password';
	if (!rawUrl) {
		return fallback;
	}

	try {
		const parsed = new URL(rawUrl);
		const id = parsed.searchParams.get(
			queryParamKey.reset_password_page.encoded_email,
		);
		const token = parsed.searchParams.get(queryParamKey.token);
		if (!id || !token) {
			return fallback;
		}

		const params = new URLSearchParams();
		params.set(queryParamKey.reset_password_page.encoded_email, id);
		params.set(queryParamKey.token, token);
		params.set(
			queryParamKey.reset_password_page.redirect_cause,
			queryParamValue.reset_password_page.redirect_cause.email_verification,
		);
		return `${fallback}?${params.toString()}`;
	} catch {
		return fallback;
	}
};
