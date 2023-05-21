import { QueryFunctionContext } from '@tanstack/react-query';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const logOutFn = async ({ queryKey: _ }: QueryFunctionContext<readonly ['logOut']>) => {
	try {
		// await Parse.User.logOut();
		const user = await Parse.User.logOut();
		return user;
	} catch (error) {
		console.log('====================================');
		console.log(error);
		console.log('====================================');
		return null;
	}
};
