import * as cookie from 'cookie';
import dayjs from 'dayjs';
import { data, redirect, useSearchParams } from 'react-router';
import { serializeError } from 'serialize-error';

import duration from '@org/shared/utils/duration.utils';

import { safeRun } from '@/front/lib/react-router/safeRun';
import { getServerAction } from '@/front/lib/react-router/server-data.server';
import {
	APP_NAME,
	FRONT_PATH_NAMES,
	LAST_USED_TENANT_ID_COOKIE_KEY,
	SESSION_TOKEN_COOKIE_KEY,
	queryParamKey,
	queryParamValue,
} from '@/shared/lib/constants';
import { makePath } from '@/shared/utils/string.utils';

import { toast } from '@/front/components/snackbar';
import { useTranslate } from '@/front/hooks/use-translate';
import _ from 'lodash';
import { useEffect } from 'react';
import type { Route } from './+types/login-page';
import LoginForm from './login-form';

export const meta = (_: Route.MetaArgs) => {
	return [{ title: `Log in - ${APP_NAME}` }];
};

export type LoginActionResult = Awaited<ReturnType<typeof action>>['data'];

export const action = getServerAction({
	action: async ({ request, apiClient }) => {
		const formData = await request.formData();

		const email = formData.get('email');
		const password = formData.get('password');

		const passwordLogin = safeRun(apiClient.auth.passwordLogin);
		const loginResult = await passwordLogin({ email, password } as never);

		if (loginResult.status === 'error') {
			return data({
				error: serializeError(loginResult.error),
			});
		}

		const resHeaders = new Headers();

		const sessionTokenCookie = cookie.serialize(
			SESSION_TOKEN_COOKIE_KEY,
			loginResult.data.sessionToken,
			{
				expires: dayjs().add(3, 'day').toDate(),
				maxAge: duration.toSeconds('3d'),
			},
		);
		resHeaders.append('Set-Cookie', sessionTokenCookie);

		apiClient.parseRestClient.setSessionToken(loginResult.data.sessionToken);

		const reqCookies = cookie.parse(request.headers.get('Set-Cookie') || '');
		const tenantId = _.get(reqCookies, LAST_USED_TENANT_ID_COOKIE_KEY);

		const { code } = await apiClient.auth.getRedirectCode({ tenantId });

		let redirectPath = makePath(code);

		if (code !== 'staff' && code !== 'unauthorized') {
			const lastUsedTenantIdCookie = cookie.serialize(
				LAST_USED_TENANT_ID_COOKIE_KEY,
				code,
				{
					expires: dayjs().add(3, 'day').toDate(),
					maxAge: duration.toSeconds('3d'),
				},
			);
			resHeaders.append('Set-Cookie', lastUsedTenantIdCookie);
			redirectPath = FRONT_PATH_NAMES.tenant(code).root;
		}

		return redirect(redirectPath, {
			headers: resHeaders,
		}) as never;
	},
});

const LoginPage = ({ actionData: _ }: Route.ComponentProps) => {
	const { t } = useTranslate();
	const [searchParams] = useSearchParams();
	const redirect_cause = searchParams.get(
		queryParamKey.login_page.redirect_cause,
	);

	useEffect(() => {
		if (
			redirect_cause ===
			queryParamValue.login_page.redirect_cause.email_verification
		) {
			toast.success(t('email-verification-success'));
		}
	}, [redirect_cause, t]);

	return <LoginForm />;
};

export default LoginPage;
