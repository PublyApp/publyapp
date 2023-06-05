// import { QueryFunctionContext } from '@tanstack/react-query';

import { IUser } from '@devist/shared/types/user.types';

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

export type LogInInput = {
	email: string;
	password: string;
};

export const logInAction = async (input: LogInInput) => {
	try {
		const { email, password } = input;
		const user = await Parse.User.logIn(email, password);

		// TODO: fetch user's roles and set the local storage

		// ? should I return the logged in User?
		return user.toJSON() as any as IUser;
	} catch (error) {
		console.log('----- logInAction error ----------', error);
		return Promise.reject(error);
	}
};

export const logOutAction = async () => {
	try {
		const user = await Parse.User.logOut();

		// TODO: remove roles local storage

		return user.toJSON() as any as IUser;
	} catch (error) {
		console.log('----- logOutAction error ----------', error);
		return Promise.reject(error);
	}
};
