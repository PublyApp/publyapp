import * as cookie from 'cookie';
import dayjs from 'dayjs';
import i18next, { type TFunction } from 'i18next';
import _ from 'lodash';
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
import {
	getTenantHintForUser,
	isSecureCookieFromRequest,
	readTenantHintsFromRequestHeaders,
	serializeClearLegacyCookieHeaders,
	serializeTenantHintsForResponse,
	setTenantHintForUser,
} from '#app/lib/cookies/index.ts';
import { formatSessionCookie } from '#app/lib/cookies/session-cookie.utils.ts';
import { getClientManager } from '#app/lib/js-client/client-manager.ts';
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
		const redirectTo = getSafeRedirectTo(
			new URL(request.url).searchParams.get(
				queryParamKey.login_page.redirect_to,
			),
		);

		const email = formData.get('email');
		const password = formData.get('password');

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

		const loginResult = await passwordLogin({ email, password } as never);

		if (loginResult.status === 'error') {
			return data({
				error: serializeError(loginResult.error),
			});
		}

		const responseHeaders = new Headers();

		const cookieOptions = {
			expires: loginResult.data?.sessionExpiresAt || new Date(),
			maxAge: dayjs(loginResult.data?.sessionExpiresAt).diff(
				dayjs(),
				'seconds',
			),
		};

		const sessionToken = loginResult.data?.sessionToken || '';

		const sessionTokenCookie = cookie.serialize(
			SESSION_TOKEN_COOKIE_KEY,
			sessionToken,
			cookieOptions,
		);
		responseHeaders.append('Set-Cookie', sessionTokenCookie);

		const reqCookies = cookie.parse(request.headers.get('Cookie') || '');
		const tenantId = _.get(reqCookies, LAST_USED_TENANT_ID_COOKIE_KEY);

		// Note: Login token is treated as tenantToken for backward compatibility
		const authedApiClient = getClientManager({
			tenantToken: sessionToken,
		}).createClient();

		const getRedirectCode = safeRun(async () => {
			return authedApiClient.auth.redirectCode.get({
				queryParameters: { tenantId },
			});
		});
		const getRedirectCodeResult = await getRedirectCode();

		if (getRedirectCodeResult.status === 'error') {
			context.logger.error('Failed to get redirect code', {
				error: serializeError(getRedirectCodeResult.error),
			});
			// throw a generic error
			throw new Error('Failed to login');
		}

		const redirectCode =
			getRedirectCodeResult.data?.redirectCode || 'unauthorized';

		let redirectPath = makePath(redirectCode);

		if (redirectCode !== 'staff' && redirectCode !== 'unauthorized') {
			const lastUsedTenantIdCookie = cookie.serialize(
				LAST_USED_TENANT_ID_COOKIE_KEY,
				redirectCode,
				{
					expires: dayjs().add(3, 'day').toDate(),
					maxAge: duration.toSeconds('3d'),
				},
			);
			responseHeaders.append('Set-Cookie', lastUsedTenantIdCookie);
			redirectPath = FRONT_PATH_NAMES.tenant(redirectCode).root;
		}

		if (redirectTo) {
			return redirect(redirectTo, {
				headers: responseHeaders,
			}) as never;
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
