import { QueryFunctionContext } from '@tanstack/react-query';

export type LogInFnInput = {
	email: string;
	password: string;
};

export const logInFn = async ({ queryKey }: QueryFunctionContext<readonly ['logIn', LogInFnInput]>) => {
	const [, { email, password }] = queryKey;

	try {
		const user = await Parse.User.logIn(email, password);
		return user;
	} catch (error) {
		console.log('====================================');
		console.log(error);
		console.log('====================================');
		return null;
	}
};
