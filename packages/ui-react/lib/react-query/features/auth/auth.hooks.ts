import { useMutation, useQueryClient, useSuspenseQuery, type MutateOptions } from '@tanstack/react-query';

import type { IUser } from '@devist/shared/types/db/user.types';
import type { LogInInput } from '@devist/shared/validations/auth.validations';

import { getClientAuthAction, logInAction, logOutAction } from './auth.actions';

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

// type UseGetClientAuthProps = {
// 	enabled?: boolean;
// };

export const getClientAuthQueryKeyBase = 'getClientAuth' as const;

// eslint-disable-next-line no-empty-pattern
export const useGetClientAuthSuspenseQuery = (/* { enabled = true }?: UseGetClientAuthProps = {} */) => {
	const key = [getClientAuthQueryKeyBase] as const;

	const result = useSuspenseQuery({
		queryKey: key,
		queryFn: getClientAuthAction,
		// enabled,
	});

	return { result, key };
};

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
			onSuccess?.(...args);
			// queryClient.invalidateQueries({ queryKey: getClientAuthKey });
			queryClient.removeQueries(); // TODO: find out which method is better
		},
	});

	return { result, key };
};
