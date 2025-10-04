import duration from '@org/shared/utils/duration.utils';
import * as cookie from 'cookie';
import dayjs from 'dayjs';
import _ from 'lodash';
import { useEffect, useRef } from 'react';
import { data, redirect, useSearchParams } from 'react-router';
import { serializeError } from 'serialize-error';
import { toast } from '@/front/components/snackbar';
import { useTranslate } from '@/front/hooks/use-translate';
import { safeRun } from '@/front/lib/react-router/safeRun';
import { getServerAction } from '@/front/lib/react-router/server-data.server';
import {
	APP_NAME,
	FRONT_PATH_NAMES,
	LAST_USED_TENANT_ID_COOKIE_KEY,
	queryParamKey,
	queryParamValue,
	SESSION_TOKEN_COOKIE_KEY,
} from '@/shared/lib/constants';
import { makePath } from '@/shared/utils/string.utils';
import type { Route } from './+types/login-page';
import LoginForm from './login-form';

export const meta = (_: Route.MetaArgs) => {
	return [{ title: `Log in - ${APP_NAME}` }];
};

export type LoginActionResult = Awaited<ReturnType<typeof action>>['data'];

export const action = getServerAction({
	action: async ({ request, apiClient, context }) => {
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

		// apiClient.parseRestClient.setSessionToken(sessionToken);

		const reqCookies = cookie.parse(request.headers.get('Set-Cookie') || '');
		const tenantId = _.get(reqCookies, LAST_USED_TENANT_ID_COOKIE_KEY);

		const getRedirectCode = safeRun(async () => {
			return apiClient.auth.redirectCode.get({ queryParameters: { tenantId } });
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
