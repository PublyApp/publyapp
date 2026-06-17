import * as cookie from 'cookie';
import i18next, { type TFunction } from 'i18next';
import capitalize from 'lodash/capitalize';
import get from 'lodash/get';
import toString from 'lodash/toString';
import { useEffect, useRef } from 'react';
import { data, redirect, useSearchParams } from 'react-router';
import { serializeError } from 'serialize-error';

import {
	APP_NAME,
	FRONT_PATH_NAMES,
	isServer,
	queryParamKey,
	queryParamValue,
	REDIRECT_CODE,
	SESSION_TOKEN_COOKIE_KEY,
} from '@org/shared-ts/lib/constants';

import { toast } from '#app/components/snackbar/index.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { getClientManager } from '#app/lib/api-client/client-manager.ts';
import { formatSessionCookie } from '#app/lib/cookies/session-cookie.utils.ts';
import {
	getTenantHintForUser,
	isSecureCookieFromRequest,
	readTenantHintsFromRequestHeaders,
	serializeClearLegacyCookieHeaders,
	serializeTenantHintsForResponse,
	setTenantHintForUser,
} from '#app/lib/cookies/tenant-hint-cookie.utils.ts';
import { safeRun } from '#app/lib/react-router/safeRun.ts';
import {
	getServerAction,
	getServerLoader,
} from '#app/lib/react-router/server-data.server.ts';
import { fSecondsUntil } from '#app/utils/format-time.ts';

import type { Route } from './+types/login-page';
import LoginForm from './login-form';

const getSafeRedirectTo = (value: string | null): string | undefined => {
	if (!value) {
		return undefined;
	}

	if (!value.startsWith('/') || value.startsWith('//')) {
		return undefined;
	}

	return value;
};

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = capitalize(t('login'));

	if (seo) {
		str = `${str} | ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [{ title: getPageTitle(t, true) }];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [{ title: getPageTitle(t, true) }],
		});
	},
});

export type LoginActionResult = Awaited<ReturnType<typeof action>>['data'];

export const action = getServerAction({
	action: async ({ request, context, url }) => {
		const apiClient = getClientManager().createClient({ skipAuth: true });
		const formData = await request.formData();
		const redirectTo = getSafeRedirectTo(
			url.searchParams.get(queryParamKey.login_page.redirect_to),
		);

		const email = toString(formData.get('email'));
		const password = toString(formData.get('password'));

		const passwordLogin = safeRun(
			async ({ email, password }: { email: string; password: string }) => {
				return apiClient.auth.login.post({
					email: {
						getValue() {
							return email;
						},
					},
					password: {
						getValue() {
							return password;
						},
					},
				});
			},
		);

		const loginResult = await passwordLogin({ email, password });

		if (loginResult.status === 'error') {
			context.logger.error('Failed to login', {
				error: serializeError(loginResult.error),
			});

			return data({
				error: serializeError(loginResult.error),
			});
		}

		const responseHeaders = new Headers();

		const cookieOptions = {
			expires: loginResult.data?.sessionExpiresAt || new Date(),
			maxAge: fSecondsUntil(loginResult.data?.sessionExpiresAt),
		};

		const sessionToken = loginResult.data?.sessionToken || '';

		// Get userId from login response (required for identity-scoped cookie)
		const userId = loginResult.data?.userId;
		if (!userId) {
			context.logger.error('Login response missing userId');
			throw new Error('Failed to login');
		}

		// Read tenant hints mapping from request (parses cookies internally)
		const { map: hintsMap, legacyTenantId } =
			readTenantHintsFromRequestHeaders(request);

		// Get hint for current user (check mapping first, then legacy cookie)
		let tenantHint = getTenantHintForUser(hintsMap, userId);
		if (!tenantHint && legacyTenantId) {
			// Migration: use legacy cookie as hint candidate
			tenantHint = legacyTenantId;
		}

		// Note: Login token is treated as tenantToken for backward compatibility
		const authedApiClient = getClientManager({
			tenantToken: sessionToken,
		}).createClient();

		const getRedirectCode = safeRun(async () => {
			return authedApiClient.auth.redirectCode.get({
				queryParameters: { tenantId: tenantHint },
			});
		});
		const getRedirectCodeResult = await getRedirectCode();

		if (getRedirectCodeResult.status === 'error') {
			context.logger.error('Failed to get redirect code', {
				error: serializeError(getRedirectCodeResult.error),
			});
			throw new Error('Failed to login');
		}

		const redirectCodeData = getRedirectCodeResult.data;
		const redirectCode =
			redirectCodeData?.redirectCode || REDIRECT_CODE.UNAUTHORIZED;
		const hasSuspendedTenants =
			(redirectCodeData as { hasSuspendedTenants?: boolean })
				?.hasSuspendedTenants ?? false;

		let redirectPath: string;
		const isSecure = isSecureCookieFromRequest(request);

		const sessionCookieValue =
			redirectCode === REDIRECT_CODE.STAFF
				? formatSessionCookie({ staffToken: sessionToken })
				: formatSessionCookie({ tenantToken: sessionToken });

		const sessionTokenCookie = cookie.serialize(
			SESSION_TOKEN_COOKIE_KEY,
			sessionCookieValue,
			cookieOptions,
		);
		responseHeaders.append('Set-Cookie', sessionTokenCookie);

		if (redirectCode === REDIRECT_CODE.STAFF) {
			redirectPath = FRONT_PATH_NAMES.staff.root;
		} else if (redirectCode === REDIRECT_CODE.UNAUTHORIZED) {
			// Login succeeded but the user has no scope they can access. We don't
			// want to redirect to a /unauthorized landing (that route was deleted
			// in PR #398) — instead we throw a 403 below so auth-layout's
			// ErrorBoundary renders View403 in place.
			//
			// Why the throw is delayed (sentinel here, throw at the bottom): we
			// still want all the responseHeaders side-effects above us (session
			// cookie set on line ~194) AND below us (legacy-cookie clearing on
			// line ~226) to apply. Throwing here would stop the function and we'd
			// lose the legacy cookie cleanup. Setting an empty redirectPath is
			// the cheapest way to signal "skip the final redirect; throw instead".
			redirectPath = '';
		} else if (redirectCode === REDIRECT_CODE.TENANT_PICKER) {
			// Multiple tenants, no valid hint - go to tenant picker
			redirectPath = FRONT_PATH_NAMES.tenant()._root;
		} else {
			// Valid tenant - update mapping and set cookie
			const updatedMap = setTenantHintForUser(hintsMap, userId, redirectCode);
			const mappingCookie = serializeTenantHintsForResponse(
				updatedMap,
				isSecure,
			);
			responseHeaders.append('Set-Cookie', mappingCookie);

			redirectPath = FRONT_PATH_NAMES.tenant(redirectCode).root;

			// Notify user about suspended orgs via query param
			if (hasSuspendedTenants) {
				redirectPath += `?${queryParamKey.notice}=${queryParamValue.notice.org_suspended}`;
			}
		}

		// Clear legacy cookie if it existed (one-time migration)
		// This happens on ALL redirect paths, not just successful tenant redirect,
		// ensuring migration completes regardless of outcome.
		// HARDENING: Clear at ALL likely paths to handle path-scoped duplicates
		if (legacyTenantId) {
			for (const clearHeader of serializeClearLegacyCookieHeaders()) {
				responseHeaders.append('Set-Cookie', clearHeader);
			}
		}

		if (redirectTo) {
			return redirect(redirectTo, {
				headers: responseHeaders,
			}) as never;
		}

		// No-scope user: see the matching `redirectPath = ''` sentinel above.
		// React Router catches a thrown Response and routes it to the nearest
		// ErrorBoundary's `error` prop — auth-layout has a 403 branch that
		// renders View403. Passing `responseHeaders` here preserves the
		// session cookie (Set-Cookie) AND the legacy-cookie clearing
		// (also Set-Cookie) accumulated earlier, even though we're throwing
		// instead of returning.
		if (redirectCode === REDIRECT_CODE.UNAUTHORIZED) {
			throw new Response(null, {
				status: 403,
				headers: responseHeaders,
			});
		}

		return redirect(redirectPath, {
			headers: responseHeaders,
		}) as never;
	},
});

const LoginPage = ({ actionData: _ }: Route.ComponentProps) => {
	const { t } = useTranslate();
	const [searchParams] = useSearchParams();
	const redirect_cause = searchParams.get(
		queryParamKey.login_page.redirect_cause,
	);
	const prefilledEmail = searchParams.get(queryParamKey.login_page.email) ?? '';
	const hasShownToast = useRef(false);

	useEffect(() => {
		if (!hasShownToast.current) {
			if (
				redirect_cause ===
				queryParamValue.login_page.redirect_cause.invalid_session
			) {
				toast.error(t('session-expired'));
			}

			if (
				redirect_cause ===
				queryParamValue.login_page.redirect_cause.password_reset_success
			) {
				toast.success(t('password-reset-success'));
			}

			hasShownToast.current = true;
		}
	}, [redirect_cause, t]);

	return <LoginForm prefilledEmail={prefilledEmail} />;
};

export default LoginPage;
