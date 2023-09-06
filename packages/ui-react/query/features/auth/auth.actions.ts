import Parse from 'parse';

// import { QueryFunctionContext } from '@tanstack/react-query';
// import Cookies from 'universal-cookie';

import { LogInInput } from '@aktiveo/shared/validations/auth.validations';
import { IUser } from '@aktiveo/shared/types/user.types';

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
function getUserRoles(user: Parse.User, toJSON?: false): Promise<Parse.Role[]>;
function getUserRoles(user: Parse.User, toJSON: true): Promise<IRole[]>;
async function getUserRoles(user: Parse.User, toJSON?: boolean) {
	const roleQuery = new Parse.Query(Parse.Role).equalTo('users', user);
	const roles = await roleQuery.find();

	if (!toJSON) return roles;

	const rolesJSON = roles.map((role) => {
		return role.toJSON() as any as IRole;
	});
	return rolesJSON;
}

export const logInAction = async (input: LogInInput) => {
	try {
		const { email, password } = input;
		const user = await Parse.User.logIn(email, password);

		// ? should I return the logged in User?
		return user.toJSON() as any as IUser;
	} catch (error) {
		console.log('----- logInAction error ----------', error);
		return Promise.reject(error);
	}
};

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

export const getClientAuthAction = async () => {
	try {
		const storedUser = await Parse.User.currentAsync();

		if (!storedUser) {
			throw new Error('Auth required');
		}

		// Handle tha cases:
		// the id does not exists
		// the session token is invalid (does not exist or expired)
		const foundUser = await new Parse.Query(Parse.User).get(storedUser.id, {
			sessionToken: storedUser.getSessionToken(),
		});

		const user: IUser = foundUser.toJSON() as any;
		const sessionToken = foundUser.getSessionToken();
		const roles = await getUserRoles(foundUser, true);

		return {
			user,
			sessionToken,
			roles,
		};
	} catch (error) {
		logOutAction();
		console.log('----- getAuthAction error ----------', error);
		return Promise.reject(error);
	}
};
