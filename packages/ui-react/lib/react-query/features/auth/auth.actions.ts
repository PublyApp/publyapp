// import Parse from 'parse';
// import { QueryFunctionContext } from '@tanstack/react-query';
// import Cookies from 'universal-cookie';

import type { LogInInput } from '@devist/shared/validations/auth.validations';

import type ParseApi from '@/ui-react/api/parse/_index';
import { ClientException } from '@/ui-react/exceptions/ClientException';

// import defaultQueryClient from '../../queryClient';
// import { ROLES_LOCAL_STORAGE_KEY, SESSION_TOKEN_COOKIE_KEY } from '../../../utils/constants';

// const isServer = typeof window === 'undefined';
// const Parse = isServer ? global.Parse : window.Parse;

// --------------------------------------------------------------------------------------//
//                                                                                      //
//                                       QUERIES                                        //
//                                                                                      //
// --------------------------------------------------------------------------------------//

// --------------------------------------------------------------------------------------//
//                                                                                      //
//                                      MUTATIONS                                       //
//                                                                                      //
// --------------------------------------------------------------------------------------//

// type IRole = {
// 	name: string;
// };

// // TODO: move to utils
// export function getUserRoles(user: Parse.User, toJSON?: false): Promise<Parse.Role[]>;
// export function getUserRoles(user: Parse.User, toJSON: true): Promise<IRole[]>;

// // eslint-disable-next-line func-style, prefer-arrow/prefer-arrow-functions
// export async function getUserRoles(user: Parse.User, toJSON?: boolean) {
// 	const roleQuery = new Parse.Query(Parse.Role).equalTo('users', user);
// 	const roles = await roleQuery.find();

// 	if (!toJSON) return roles;

// 	const rolesJSON = roles.map((role) => {
// 		return role.toJSON() as unknown as IRole;
// 	});
// 	return rolesJSON;
// }

// ---- 1 --------------------------------------------------------------------------------

export const logInAction = (parseApi: ParseApi) => {
	return async (input: LogInInput) => {
		try {
			const { email, password } = input;

			const user = await parseApi.parseRestClient.passwordLogin(email, password);

			return user;
		} catch (error) {
			console.log('----- logInAction error ----------', error);
			return Promise.reject(error);
		}
	};
};

// ---- 2 --------------------------------------------------------------------------------

export const logOutAction = async (): Promise<void> => {
	try {
		await Parse.User.logOut();

		console.log('----- logged Out -----');
		return await Promise.resolve();
	} catch (error) {
		console.log('----- logOutAction error ----------', error);
		return Promise.reject(error);
	}
};

// ---- 3 --------------------------------------------------------------------------------

export const getClientAuthAction = (parseApi: ParseApi) => {
	return async () => {
		try {
			const authData = await parseApi.parseRestClient.cloudRun('getUserAuthData');

			return authData;
		} catch (error) {
			console.log('----- getAuthAction error ----------', error);

			if (error instanceof ClientException) {
				if (error.code === ClientException.AUTH_REQUIRED) {
					logOutAction();
				}
			}

			return Promise.reject(error);
		}
	};
};
