import * as cookie from 'cookie';
import i18next, { type TFunction } from 'i18next';
import _ from 'lodash';
import { useEffect, useRef } from 'react';
import { data, redirect, useSearchParams } from 'react-router';
import { serializeError } from 'serialize-error';

import { toast } from '@/front/components/snackbar';
import { useTranslate } from '@/front/hooks/use-translate';
import {
	getTenantHintForUser,
	isSecureCookieFromRequest,
	readTenantHintsFromRequestHeaders,
	serializeClearLegacyCookieHeaders,
	serializeTenantHintsForResponse,
	setTenantHintForUser,
} from '@/front/lib/cookies';
import { formatSessionCookie } from '@/front/lib/cookies/session-cookie.utils';
import { getClientManager } from '@/front/lib/js-client/client-manager';
import { safeRun } from '@/front/lib/react-router/safeRun';
import {
	getServerAction,
	getServerLoader,
} from '@/front/lib/react-router/server-data.server';
import { fSecondsUntil } from '@/front/utils/format-time';
import {
	APP_NAME,
	FRONT_PATH_NAMES,
	isServer,
	queryParamKey,
	queryParamValue,
	REDIRECT_CODE,
	SESSION_TOKEN_COOKIE_KEY,
} from '@/shared/lib/constants';

import type { Route } from './+types/login-page';
import LoginForm from './login-form';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('login'));

	if (seo) {
		str = `${str} | ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.loaderData, 'meta', []);
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
	action: async ({ request, context }) => {
		const apiClient = getClientManager().createClient({ skipAuth: true });
		const formData = await request.formData();

		const email = _.toString(formData.get('email'));
		const password = _.toString(formData.get('password'));

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

		const redirectCode =
			getRedirectCodeResult.data?.redirectCode || REDIRECT_CODE.UNAUTHORIZED;

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
			redirectPath = FRONT_PATH_NAMES.unauthorized;
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

	return <LoginForm />;
};

export default LoginPage;
