import * as cookie from 'cookie';
import dayjs from 'dayjs';
import i18next, { type TFunction } from 'i18next';
import _ from 'lodash';
import { useEffect, useRef } from 'react';
import { data, redirect, useSearchParams } from 'react-router';
import { serializeError } from 'serialize-error';

import duration from '@org/shared/utils/duration.utils';
import { toast } from '@/front/components/snackbar';
import { useTranslate } from '@/front/hooks/use-translate';
import { getClientManager } from '@/front/lib/js-client/client-manager';
import { safeRun } from '@/front/lib/react-router/safeRun';
import {
	getServerAction,
	getServerLoader,
} from '@/front/lib/react-router/server-data.server';
import {
	APP_NAME,
	FRONT_PATH_NAMES,
	isServer,
	LAST_USED_TENANT_ID_COOKIE_KEY,
	queryParamKey,
	queryParamValue,
	SESSION_TOKEN_COOKIE_KEY,
} from '@/shared/lib/constants';
import { makePath } from '@/shared/utils/string.utils';

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
