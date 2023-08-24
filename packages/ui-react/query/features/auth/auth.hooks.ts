import { useMutation } from '@tanstack/react-query';

import { useAuth } from '../../../hooks/useAuth';
import { logInAction, logOutAction } from './auth.actions';

export const useLogInMutation = () => {
	const { syncUserState } = useAuth();

	const mutationResult = useMutation({
		mutationKey: ['logIn'],
		mutationFn: logInAction,
		onSuccess: () => {
			syncUserState();
		},
	});

	return mutationResult;
};

export const useLogOutMutation = () => {
	const { syncUserState } = useAuth();

	const key = ['logout'] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: logOutAction,
		onSuccess: () => {
			syncUserState();
		},
	});

	return { result, key };
};
