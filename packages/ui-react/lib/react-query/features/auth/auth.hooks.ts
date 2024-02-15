import { queryOptions, useMutation, useQueryClient, useSuspenseQuery, type MutateOptions } from '@tanstack/react-query';

import type { IUser } from '@devist/shared/types/db/user.types';
import type { LogInInput } from '@devist/shared/validations/auth.validations';

import { getClientAuthAction, logInAction, logOutAction } from './auth.actions';

// ---- 1 --------------------------------------------------------------------------------

type UseLogInMutationProps = {
	onSuccess?: MutateOptions<IUser, Error, LogInInput>['onSuccess'];
};

export const useLogInMutation = ({ onSuccess }: UseLogInMutationProps = {}) => {
	const key = ['logIn'] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: logInAction,
		onSuccess,
	});

	return { result, key };
};

// ---- 2 --------------------------------------------------------------------------------

export const getClientAuthQueryKeyBase = 'getClientAuth' as const;

export const getClientAuthQuery = queryOptions({
	queryKey: [getClientAuthQueryKeyBase] as const,
	queryFn: getClientAuthAction,
});

type UseGetClientAuthProps = {
	options?: Omit<typeof getClientAuthQuery, 'queryKey' | 'queryFn'>;
};

export const useGetClientAuthSuspenseQuery = ({ options }: UseGetClientAuthProps = {}) => {
	const query = getClientAuthQuery;

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
	const key = ['logOut'] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: logOutAction,
		onSuccess: (...args) => {
			// queryClient.invalidateQueries({ queryKey: getClientAuthKey });
			queryClient.removeQueries(); // TODO: find out which method is better
			onSuccess?.(...args);
		},
	});

	return { result, key };
};
