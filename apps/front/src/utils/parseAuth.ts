import { cookies } from 'next/headers';

import { getUserRoles } from '@aktiveo/ui-react/query/features/auth/auth.actions';
import { SESSION_TOKEN_COOKIE_KEY } from '@aktiveo/ui-react/utils/constants';

import { initParseFront } from './initParseFront';

initParseFront();

export const getServerAuth = async () => {
	try {
		const cookieStore = cookies();
		const cookie = cookieStore.get(SESSION_TOKEN_COOKIE_KEY);
		// console.log('====================================');
		// console.log(cookie);
		// console.log('====================================');

		const sessionWithUser = await new Parse.Query(Parse.Session)
			.equalTo('sessionToken', cookie.value)
			.include('user')
			.first({ useMasterKey: true });

		const roles = await getUserRoles(sessionWithUser.get('user'));

		return { sessionWithUser, roles };
	} catch (error: unknown) {
		console.log('----- getServerAuth error --------------------');
		console.log(error);

		return Promise.resolve();
	}
};
