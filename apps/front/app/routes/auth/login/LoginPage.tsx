import { Anchor, Box, Text, Title } from '@mantine/core';
import { createCookie, data, redirect } from 'react-router';

import { getServerAction } from '@/front/lib/react-router/function.server';
import { safeRun } from '@/front/lib/react-router/safeRun';
import { getRequestCookie } from '@/front/utils/web.utils';
import { FRONT_PATH_NAMES, LAST_USED_TENANT_ID_COOKIE_KEY, SESSION_TOKEN_COOKIE_KEY } from '@/shared/lib/constants';
import { makePath } from '@/shared/utils/string.utils';

import type { Route } from './+types/LoginPage';
import LoginForm from './LoginForm';
import { classes } from './LoginPage.css';

// TODO: implement geServerAction: it needs to initialize a CustomZod instance
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

		apiClient.parseRestClient.setSessionToken(loginResult.data.sessionToken);

		const tenantId = getRequestCookie(request, LAST_USED_TENANT_ID_COOKIE_KEY);

		// const getRedirectCode = safeRun(apiClient.auth.getRedirectCode);
		const { code } = await apiClient.auth.getRedirectCode({ tenantId });

		let redirectPath = makePath(code);

		if (code !== 'staff' && code !== 'unauthorized') {
			redirectPath = FRONT_PATH_NAMES.tenant(code).root;
		}

		const cookies = {
			lastUsedTenant: createCookie(LAST_USED_TENANT_ID_COOKIE_KEY),
			sessionToken: createCookie(SESSION_TOKEN_COOKIE_KEY),
		};

		const sessionCookie = await cookies.sessionToken.serialize(loginResult.data.sessionToken);
		const tenantCookie = await cookies.lastUsedTenant.serialize(tenantId);

		// const res = {
		// 	lol: 'ok',
		// 	test: [sessionCookie, tenantCookie].join('; '),
		// };
		// console.dir(res, { depth: null });
		// return res;
		return redirect(redirectPath, {
			headers: {
				'Set-Cookie': [sessionCookie, tenantCookie].join('; '),
			},
		}) as never;
		// const result = getLoginSchema(z).safeParse({});
	},
});

const LoginPage = ({ actionData }: Route.ComponentProps) => {
	console.log('🙏🙏🙏🙏', actionData);

	return (
		<Box w={420} my={40}>
			<Title ta="center" className={classes.title}>
				Welcome back!
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
