import { Anchor, Box, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { data, redirect } from 'react-router';

import { CookieManager } from '@/front/lib/cookie-manager';
import { getServerAction } from '@/front/lib/react-router/function.server';
import { safeRun } from '@/front/lib/react-router/safeRun';
import { FRONT_PATH_NAMES, LAST_USED_TENANT_ID_COOKIE_KEY, SESSION_TOKEN_COOKIE_KEY } from '@/shared/lib/constants';
import { makePath } from '@/shared/utils/string.utils';

import type { Route } from './+types/LoginPage';
import LoginForm from './LoginForm';
import { classes } from './LoginPage.css';

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

		const cookieManager = new CookieManager(request.headers.get('cookie') || '');

		apiClient.parseRestClient.setSessionToken(loginResult.data.sessionToken);

		cookieManager.set(SESSION_TOKEN_COOKIE_KEY, loginResult.data.sessionToken);

		const tenantId = cookieManager.get(LAST_USED_TENANT_ID_COOKIE_KEY);

		const { code } = await apiClient.auth.getRedirectCode({ tenantId });

		let redirectPath = makePath(code);

		if (code !== 'staff' && code !== 'unauthorized') {
			cookieManager.set(LAST_USED_TENANT_ID_COOKIE_KEY, code);
			redirectPath = FRONT_PATH_NAMES.tenant(code).root;
		}

		const headers = new Headers();
		cookieManager
			.parse()
			.entries()
			.forEach((e) => {
				headers.append('Set-Cookie', `${e[0]}=${e[1]}`);
			});

		return redirect(redirectPath, {
			headers,
		}) as never;
	},
});

const LoginPage = ({ actionData }: Route.ComponentProps) => {
	const { t } = useTranslation();
	console.info('🙏🙏🙏🙏', actionData);

	return (
		<Box w={420} my={40}>
			<Title ta="center" className={classes.title}>
				{t('hello')} Welcome back!
			</Title>
			<Text c="dimmed" size="sm" ta="center" mt={5}>
				Do not have an account yet?{' '}
				<Anchor size="sm" component="button">
					Create account
				</Anchor>
			</Text>

			<LoginForm />
		</Box>
	);
};

export default LoginPage;
