import { queryOptions } from '@tanstack/react-query';

import parseApi from '@devist/api/parse/ParseApi';
import type { LoginInput } from '@devist/shared/validations/auth.validations';

import { functionName } from '@/shared/lib/constants';

// ---- 1 --------------------------------------------------------------------------------

export const loginAction = async (input: LoginInput) => {
	try {
		const { email, password } = input;

		const user = await parseApi.users.passwordLogin({ username: email, password });

		return user;
	} catch (error) {
		console.log('----- loginAction error ----------', error);
		return Promise.reject(error);
	}
};

// ---- 2 --------------------------------------------------------------------------------

export const logOutAction = async (): Promise<void> => {
	try {
		await parseApi.parseRestClient.logOut();
		// await Parse.User.logOut();

		console.log('----- logged Out -----');
		return await Promise.resolve();
	} catch (error) {
		console.log('----- logOutAction error ----------', error);
		return Promise.reject(error);
	}
};

// ---- 3 --------------------------------------------------------------------------------
export const getUserAuthDataQueryKeyBase = functionName.getUserAuthData;

export const getUserAuthDataAction = async () => {
	try {
		const authData = await parseApi.users.getUserAuthData();

		return authData;
	} catch (error) {
		console.log('----- getUserAuthData error ----------', error);

		// what if invalid sessionToken ?
		// what if no session token at all ?

		// if (error instanceof ClientException) {
		// 	if (error.code === ClientException.AUTH_REQUIRED) {
		// 		logOutAction();
		// 	}
		// }

		return Promise.reject(error);
	}
};

export const getUserAuthDataQuery = queryOptions({
	queryKey: [getUserAuthDataQueryKeyBase] as const,
	queryFn: getUserAuthDataAction,
});
