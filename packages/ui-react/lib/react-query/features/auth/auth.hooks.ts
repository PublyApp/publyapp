import { useMutation, useQueryClient, useSuspenseQuery, type MutateOptions } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import parseApi from '@devist/api/parse/ParseApi';
import type { LoginInput, SignupInput, VerifyEmailInput } from '@devist/shared/validations/auth.validations';

import { BO_PATH_NAMES, SESSION_TOKEN_LOCAL_STORAGE_KEY } from '@/shared/lib/constants';
import { localStorageSetItem, localStorageUnsetItem } from '@/ui-react/utils/storage.utils';

import {
	getIsDisabledSignupQuery,
	getUserAuthDataQuery,
	loginAction,
	logOutAction,
	signupAction,
	verifyEmailAction,
	type GetUserAuthDataQueryParams,
} from './auth.actions';

// import { getUserAuthDataAction, loginAction, logOutAction } from './auth.actions';

// ---- 1 --------------------------------------------------------------------------------

type LoginData = Awaited<ReturnType<typeof loginAction>>;

type UseLoginMutationProps = {
	options?: Omit<MutateOptions<LoginData, Error, LoginInput>, 'mutationKey' | 'mutationFn'>;
	// parseApi: ParseApi; // todo: do some tests in the case we will need a loginAs feature

	// onSuccess?: MutateOptions<IUser, Error, LoginInput>['onSuccess'];
};

export const useLoginMutation = ({ options = {} }: UseLoginMutationProps = {}) => {
	const { onSuccess, ...restOptions } = options;

	const key = ['login'] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: loginAction,
		onSuccess: (data, variables, context) => {
			localStorageSetItem(SESSION_TOKEN_LOCAL_STORAGE_KEY, data.sessionToken);
			parseApi.parseRestClient.setSessionToken(data.sessionToken);
			onSuccess?.(data, variables, context);
		},
		...restOptions,
	});

	return { result, key };
};

// ---- 2 --------------------------------------------------------------------------------

type UseGetClientAuthProps = {
	params: GetUserAuthDataQueryParams;
	options?: Omit<typeof getUserAuthDataQuery, 'queryKey' | 'queryFn'>;
};

export const useGetClientAuthSuspenseQuery = ({ params, options }: UseGetClientAuthProps = { params: {} }) => {
	const query = getUserAuthDataQuery(params);

	const result = useSuspenseQuery({
		...query,
		...options,
	});

	return { result, key: query.queryKey };
};

// ---- 3 --------------------------------------------------------------------------------

type UseLogOutMutationProps = {
	onSuccess?: MutateOptions['onSuccess'];
};

export const useLogOutMutation = ({ onSuccess }: UseLogOutMutationProps = {}) => {
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	const key = ['logOut'] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: logOutAction,
		onSuccess: (...args) => {
			localStorageUnsetItem(SESSION_TOKEN_LOCAL_STORAGE_KEY);
			queryClient.removeQueries();
			navigate(BO_PATH_NAMES.auth.login);
			onSuccess?.(...args);
		},
	});

	return { result, key };
};

// ---- 4 --------------------------------------------------------------------------------

type UseVerifyEmailMutationProps = {
	options?: Omit<MutateOptions<unknown, Error, VerifyEmailInput>, 'mutationKey' | 'mutationFn'>;
	// parseApi: ParseApi; // todo: do some tests in the case we will need a loginAs feature
	// onSuccess?: MutateOptions<IUser, Error, LoginInput>['onSuccess'];
};

export const useVerifyEmailMutation = ({ options = {} }: UseVerifyEmailMutationProps = {}) => {
	const key = ['signUp'] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: verifyEmailAction,
		...options,
	});

	return { result, key };
};

// ---- 5 --------------------------------------------------------------------------------

type UseSignupMutationProps = {
	options?: Omit<MutateOptions<unknown, Error, SignupInput>, 'mutationKey' | 'mutationFn'>;
	// parseApi: ParseApi; // todo: do some tests in the case we will need a loginAs feature
	// onSuccess?: MutateOptions<IUser, Error, LoginInput>['onSuccess'];
};

export const useSignupMutation = ({ options = {} }: UseSignupMutationProps = {}) => {
	const key = ['verifyEmail'] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: signupAction,
		...options,
	});

	return { result, key };
};

// ---- 6 --------------------------------------------------------------------------------

type UseGeIsDisabledSignupProps = {
	options?: Omit<typeof getIsDisabledSignupQuery, 'queryKey' | 'queryFn'>;
};

export const useGetIsDisabledSignupSuspenseQuery = ({ options }: UseGeIsDisabledSignupProps = {}) => {
	const query = getIsDisabledSignupQuery;

	const result = useSuspenseQuery({
		...query,
		...options,
	});

	return { result, key: query.queryKey };
};
