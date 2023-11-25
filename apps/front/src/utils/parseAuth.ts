import { cookies } from 'next/headers';

import { SESSION_TOKEN_COOKIE_KEY } from '@devist/ui-react/lib/constants';
import { getUserRoles } from '@devist/ui-react/lib/react-query/features/auth/auth.actions';

import { initParseFront } from './initParseFront';

initParseFront();

export const getServerAuth = async () => {
	try {
		const cookieStore = cookies();
		const cookie = cookieStore.get(SESSION_TOKEN_COOKIE_KEY);

		const sessionWithUser = await new Parse.Query(Parse.Session)
			.equalTo('sessionToken', cookie.value)
			.include('user')
			.first({ /* useMasterKey: true */ sessionToken: cookie.value });

		const roles = await getUserRoles(sessionWithUser.get('user'));

		return { sessionWithUser, roles };
	} catch (error: unknown) {
		console.log('----- getServerAuth error --------------------');
		console.log(error);

		return Promise.resolve();
	}
};
