import dayjs from 'dayjs';
import i18next from 'i18next';
import { data, redirect } from 'react-router';

import duration from '@devist/shared/utils/duration.utils';

import { CookieManager } from '@/front/lib/cookie-manager';
import { getServerAction } from '@/front/lib/react-router/function.server';
import { safeRun } from '@/front/lib/react-router/safeRun';
import { FRONT_PATH_NAMES, LAST_USED_TENANT_ID_COOKIE_KEY, SESSION_TOKEN_COOKIE_KEY } from '@/shared/lib/constants';
import { makePath } from '@/shared/utils/string.utils';

import type { Route } from './+types/LoginPage';
import LoginForm from './LoginForm';

export const action = getServerAction({
	action: async ({ request, apiClient }) => {
		const formData = await request.formData();

		const email = formData.get('email');
		const password = formData.get('password');

		const passwordLogin = safeRun(apiClient.auth.passwordLogin);
		const loginResult = await passwordLogin({ email, password } as never);

		if (loginResult.status === 'error') {
			return data({
				error: loginResult.error,
			});
		}

		const reqCookies = new CookieManager(request.headers);

		const resHeaders = new Headers();
		const resCookies = new CookieManager(resHeaders);

		apiClient.parseRestClient.setSessionToken(loginResult.data.sessionToken);

		resCookies.set(SESSION_TOKEN_COOKIE_KEY, loginResult.data.sessionToken, {
			maxAge: duration.toSeconds('3d'),
		});

		const tenantId = reqCookies.get(LAST_USED_TENANT_ID_COOKIE_KEY);

		const { code } = await apiClient.auth.getRedirectCode({ tenantId });

		let redirectPath = makePath(code);

		if (code !== 'staff' && code !== 'unauthorized') {
			resCookies.set(LAST_USED_TENANT_ID_COOKIE_KEY, code, {
				expires: dayjs().add(3, 'day').toDate(),
				maxAge: duration.toSeconds('3d'),
			});
			redirectPath = FRONT_PATH_NAMES.tenant(code).root;
		}

		return redirect(redirectPath, {
			headers: resHeaders,
		}) as never;
	},
});

export const clientLoader = async (_: Route.ClientLoaderArgs) => {
	i18next.loadNamespaces(['zod']);
	return data({});
};

const LoginPage = ({ actionData: _ }: Route.ComponentProps) => {
	return <LoginForm />;
};

export default LoginPage;
