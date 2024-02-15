import Parse from 'parse';

// import { QueryFunctionContext } from '@tanstack/react-query';
// import Cookies from 'universal-cookie';

import type { IUser } from '@devist/shared/types/db/user.types';
import type { LogInInput } from '@devist/shared/validations/auth.validations';

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

type IRole = {
	name: string;
};

// TODO: move to utils
export function getUserRoles(user: Parse.User, toJSON?: false): Promise<Parse.Role[]>;
export function getUserRoles(user: Parse.User, toJSON: true): Promise<IRole[]>;

// eslint-disable-next-line func-style, prefer-arrow/prefer-arrow-functions
export async function getUserRoles(user: Parse.User, toJSON?: boolean) {
	const roleQuery = new Parse.Query(Parse.Role).equalTo('users', user);
	const roles = await roleQuery.find();

	if (!toJSON) return roles;

	const rolesJSON = roles.map((role) => {
		return role.toJSON() as unknown as IRole;
	});
	return rolesJSON;
}

// ---- 1 --------------------------------------------------------------------------------

export const logInAction = async (input: LogInInput) => {
	try {
		const { email, password } = input;
		const user = await Parse.User.logIn(email, password);

		// defaultQueryClient.getQueryCache().find({ queryKey})

		// ? should I return the logged in User?
		return user.toJSON() as unknown as IUser;
	} catch (error) {
		console.log('----- logInAction error ----------', error);
		return Promise.reject(error);
	}
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
// export const AUTH_REQUIRED_ERROR_MSG = 'Auth required';

// TODO: create a cloud function and call it from instead
export const getClientAuthAction = async () => {
	try {
		// const storedUser = await Parse.User.currentAsync();
		const storedUser = Parse.User.current();

		if (!storedUser) {
			throw new ClientException(ClientException.AUTH_REQUIRED, /* i18n.t('---xxx----') */ 'Auth required');
		}

		// Handle tha cases:
		// the id does not exists
		// the session token is invalid (does not exist or expired)
		const foundUser = await new Parse.Query(Parse.User).get(storedUser.id, {
			sessionToken: storedUser.getSessionToken(),
		});

		const user = foundUser.toJSON() as unknown as IUser;
		const sessionToken = foundUser.getSessionToken();
		const roles = await getUserRoles(foundUser, true);

		return {
			user,
			sessionToken,
			roles,
		};
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
