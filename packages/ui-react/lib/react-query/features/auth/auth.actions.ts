import { queryOptions, type QueryFunctionContext } from '@tanstack/react-query';

import parseApi from '@devist/api/parse/ParseApi';
import type { LoginInput, SignupInput, VerifyEmailInput } from '@devist/shared/validations/auth.validations';

import type { GetUserAuthDataFunction } from '@/server/resources/auth/auth.functions';
import { functionName } from '@/shared/lib/constants';

// ---- 1 --------------------------------------------------------------------------------
export const loginAction = async (input: LoginInput) => {
	try {
		const { email, password } = input;

		const user = await parseApi.auth.passwordLogin({ username: email, password });

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
export const getUserAuthDataQueryKeyBase = functionName.auth.getUserAuthData;

export type GetUserAuthDataQueryParams = GetUserAuthDataFunction.Params;

export const getUserAuthDataAction = async (
	context: QueryFunctionContext<readonly [typeof getUserAuthDataQueryKeyBase, GetUserAuthDataQueryParams]>,
) => {
	try {
		const params = context.queryKey[1];

		const authData = await parseApi.auth.getUserAuthData(params);

		return authData;
	} catch (error) {
		console.log('----- getUserAuthDataAction error ----------', error);
		return Promise.reject(error);
	}
};

export const getUserAuthDataQuery = (params: GetUserAuthDataQueryParams = {}) => {
	return queryOptions({
		queryKey: [getUserAuthDataQueryKeyBase, params as never] as const,
		queryFn: getUserAuthDataAction,
	});
};

// ---- 4 --------------------------------------------------------------------------------
export const verifyEmailAction = async ({ email }: VerifyEmailInput) => {
	try {
		return await parseApi.auth.verificationEmailRequest({ email });
	} catch (error) {
		console.log('----- verifyEmailAction error ----------', error);
		return Promise.reject(error);
	}
};

// ---- 5 --------------------------------------------------------------------------------
export const signupAction = async (input: SignupInput) => {
	try {
		return await parseApi.auth.passwordSignup(input);
	} catch (error) {
		console.log('----- signupAction error ----------', error);
		return Promise.reject(error);
	}
};

// ---- 5 --------------------------------------------------------------------------------
export const getIsDisabledSignupAction = async () => {
	try {
		return await parseApi.auth.getIsDisabledSignup();
	} catch (error) {
		console.log('----- getIsDisabledSignupAction error ----------', error);
		return Promise.reject(error);
	}
};

export const getIsDisabledSignupQueryKeyBase = functionName.auth.getIsDisabledSignup;

export const getIsDisabledSignupQuery = queryOptions({
	queryKey: [getIsDisabledSignupQueryKeyBase] as const,
	queryFn: getIsDisabledSignupAction,
});
