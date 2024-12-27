import { Outlet, redirect } from 'react-router';
import { ClientOnly } from 'remix-utils/client-only';

import { getBrowserCookie } from '@/front/utils/browser.utils';
import { SESSION_TOKEN_COOKIE_KEY } from '@/shared/lib/constants';

import type { Route } from './+types/AuthedPagesLayout';

export const clientLoader = async () => {
	const sessionToken = getBrowserCookie(SESSION_TOKEN_COOKIE_KEY);

	if (!sessionToken) {
		return redirect('/login') as never; // redirect to login
	}

	// return { sessionToken };
};

const AuthedPagesLayout = ({ loaderData }: Route.ComponentProps) => {
	const {} = loaderData;
	return <Outlet />;
	// return (
	// 	<ClientOnly>
	// 		{() => {
	// 			return <Outlet />;
	// 		}}
	// 	</ClientOnly>
	// );
};

export default AuthedPagesLayout;
