import { useMutation, useQueryClient, useSuspenseQuery, type MutateOptions } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import parseApi from '@devist/api/parse/ParseApi';
import type { IUser } from '@devist/shared/types/db/user.types';
import type { LoginInput, VerifyEmailInput } from '@devist/shared/validations/auth.validations';

import { BO_PATH_NAMES, SESSION_TOKEN_LOCAL_STORAGE_KEY } from '@/shared/lib/constants';
import { localStorageSetItem, localStorageUnsetItem } from '@/ui-react/utils/storage.utils';

import { getUserAuthDataQuery, loginAction, logOutAction, verifyEmailAction } from './auth.actions';

// import { getUserAuthDataAction, loginAction, logOutAction } from './auth.actions';

// ---- 1 --------------------------------------------------------------------------------

type UseLoginMutationProps = {
	options?: Omit<MutateOptions<IUser, Error, LoginInput>, 'mutationKey' | 'mutationFn'>;
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

// export const getClientAuthQueryKeyBase = 'getClientAuth' as const;

// export const getUserAuthDataQuery = (parseApi: ParseApi) => {
// 	return queryOptions({
// 		queryKey: [getClientAuthQueryKeyBase] as const,
// 		queryFn: getUserAuthDataAction(parseApi),
// 	});
// };

type UseGetClientAuthProps = {
	options?: Omit<typeof getUserAuthDataQuery, 'queryKey' | 'queryFn'>;
};

export const useGetClientAuthSuspenseQuery = ({ options }: UseGetClientAuthProps = {}) => {
	const query = getUserAuthDataQuery;

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
	const key = ['verifyEmail'] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: verifyEmailAction,
		...options,
	});

	return { result, key };
};
