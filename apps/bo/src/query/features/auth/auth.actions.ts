// import { QueryFunctionContext } from '@tanstack/react-query';
import { LogInInput } from '@aktivpost/shared/validations/auth.validations';
import { IUser } from '@aktivpost/shared/types/user.types';

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

		// TODO: fetch user's roles and set the local storage
		const roles = await getUserRoles(user);
		const JSONRoles = roles.map((role) => {
			return role.toJSON();
		});

		localStorage.setItem(ROLES_LOCAL_STORAGE_KEY, JSON.stringify(JSONRoles));

		// ? should I return the logged in User?
		return user.toJSON() as any as IUser;
	} catch (error) {
		console.log('----- logInAction error ----------', error);
		return Promise.reject(error);
	}
};

// eslint-disable-next-line consistent-return
export const logOutAction = async (): Promise<void> => {
	try {
		await Parse.User.logOut();

		// remove roles from local storage
		localStorage.setItem(ROLES_LOCAL_STORAGE_KEY, JSON.stringify([]));

		console.log('----- logged Out -----');
	} catch (error) {
		console.log('----- logOutAction error ----------', error);
		return Promise.reject(error);
	}
};
