// import { QueryFunctionContext } from '@tanstack/react-query';
import Cookies from 'universal-cookie';

import { LogInInput } from '@aktiveo/shared/validations/auth.validations';
import { IUser } from '@aktiveo/shared/types/user.types';

import { ROLES_LOCAL_STORAGE_KEY } from '../../../utils/constants';

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

export async function getUserRoles(user: Parse.User) {
	const roleQuery = new Parse.Query(Parse.Role).equalTo('users', user);
	const roles = await roleQuery.find();
	return roles;
}

export const logInAction = async (input: LogInInput) => {
	try {
		const { email, password } = input;
		const user = await Parse.User.logIn(email, password);

		new Cookies().set('xxx-session-token', user.getSessionToken());

		// TODO: fetch user's roles and set the local storage
		const roles = await getUserRoles(user);
		const JSONRoles = roles.map((role) => {
			return role.toJSON();
		});

		// TODO: Instead of creating a new local storage append roles to the user in 'Parse/User/current' key
		localStorage.setItem(ROLES_LOCAL_STORAGE_KEY, JSON.stringify(JSONRoles));

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

		new Cookies().remove('xxx-session-token');

		// remove roles from local storage
		localStorage.setItem(ROLES_LOCAL_STORAGE_KEY, JSON.stringify([]));

		console.log('----- logged Out -----');
		return await Promise.resolve();
	} catch (error) {
		console.log('----- logOutAction error ----------', error);
		return Promise.reject(error);
	}
};
