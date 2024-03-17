// import Parse from 'parse';
// import { QueryFunctionContext } from '@tanstack/react-query';
// import Cookies from 'universal-cookie';

import { queryOptions } from '@tanstack/react-query';

import type { LogInInput } from '@devist/shared/validations/auth.validations';

import { functionName } from '@/shared/lib/constants';
import type ParseApi from '@/ui-react/api/parse/ParseApi';

// import { ClientException } from '@/ui-react/exceptions/ClientException';

export default class AuthActions {
	constructor(private parseApi: ParseApi) {}

	// ---- 1 --------------------------------------------------------------------------------

	logInAction = async (input: LogInInput) => {
		try {
			const { email, password } = input;

			const user = await this.parseApi.parseRestClient.passwordLogin(email, password);

			return user;
		} catch (error) {
			console.log('----- logInAction error ----------', error);
			return Promise.reject(error);
		}
	};

	// ---- 2 --------------------------------------------------------------------------------

	async logOutAction(): Promise<void> {
		try {
			await this.parseApi.parseRestClient.logOut();
			// await Parse.User.logOut();

			console.log('----- logged Out -----');
			return await Promise.resolve();
		} catch (error) {
			console.log('----- logOutAction error ----------', error);
			return Promise.reject(error);
		}
	}

	// ---- 3 --------------------------------------------------------------------------------

	static getUserAuthDataQueryKeyBase = functionName.getUserAuthData;

	getUserAuthDataQuery = queryOptions({
		queryKey: [AuthActions.getUserAuthDataQueryKeyBase] as const,
		queryFn: this.getUserAuthDataAction.bind(this),
	});

	async getUserAuthDataAction() {
		try {
			const authData = await this.parseApi.users.getUserAuthData();

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
	}
}
