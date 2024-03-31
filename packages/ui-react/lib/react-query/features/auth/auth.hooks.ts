import { useMutation, useQueryClient, useSuspenseQuery, type MutateOptions } from '@tanstack/react-query';

import type { IUser } from '@devist/shared/types/db/user.types';
import type { LogInInput } from '@devist/shared/validations/auth.validations';

import { SESSION_TOKEN_LOCAL_STORAGE_KEY } from '@/shared/lib/constants';
import parseApi from '@/ui-react/api/parse/ParseApi';
import { localStorageSetItem } from '@/ui-react/utils/storage.utils';

import AuthActions from './auth.actions';

// import { getUserAuthDataAction, logInAction, logOutAction } from './auth.actions';

// ---- 1 --------------------------------------------------------------------------------

type UseLogInMutationProps = {
	options?: Omit<MutateOptions<IUser, Error, LogInInput>, 'mutationKey' | 'mutationFn'>;
	// parseApi: ParseApi; // todo: do some tests in the case we will need a loginAs feature

	// onSuccess?: MutateOptions<IUser, Error, LogInInput>['onSuccess'];
};

export const useLogInMutation = ({ options = {} }: UseLogInMutationProps = {}) => {
	const { onSuccess, ...restOptions } = options;

	const authActions = new AuthActions(parseApi);

	const key = ['logIn'] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: authActions.logInAction,
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
	options?: Omit<typeof AuthActions.prototype.getUserAuthDataQuery, 'queryKey' | 'queryFn'>;
};

export const useGetClientAuthSuspenseQuery = ({ options }: UseGetClientAuthProps = {}) => {
	const authActions = new AuthActions(parseApi);
	const query = authActions.getUserAuthDataQuery;

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

	const authActions = new AuthActions(parseApi);

	const key = ['logOut'] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: authActions.logOutAction,
		onSuccess: (...args) => {
			queryClient.removeQueries();
			onSuccess?.(...args);
		},
	});

	return { result, key };
};
