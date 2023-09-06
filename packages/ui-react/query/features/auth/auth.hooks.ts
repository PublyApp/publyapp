import { useMutation, useQuery, useQueryClient, type MutateOptions } from '@tanstack/react-query';

import { IUser } from '@aktiveo/shared/types/user.types';
import { LogInInput } from '@aktiveo/shared/validations/auth.validations';

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

type UseGetClientAuthProps = {
	enabled?: boolean;
};

export const useGetClientAuth = ({ enabled }: UseGetClientAuthProps = {}) => {
	const key = ['getClientAuth'] as const;

	const result = useQuery({
		queryKey: key,
		queryFn: getClientAuthAction,
		enabled,
	});

	return { result, key };
};

type UseLogOutMutationProps = {
	onSuccess?: MutateOptions['onSuccess'];
};

export const useLogOutMutation = ({ onSuccess }: UseLogOutMutationProps = {}) => {
	const queryClient = useQueryClient();
	// const { key: getClientAuthKey } = useGetClientAuth({ enabled: false });
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
