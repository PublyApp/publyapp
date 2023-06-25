import { useMutation } from '@tanstack/react-query';

import { logInAction, logOutAction } from './auth.actions';

export const useLogInMutation = ({ useAuth }: { useAuth: () => any }) => {
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

export const useLogOutMutation = ({ useAuth }: { useAuth: () => any }) => {
	const { syncUserState } = useAuth();

	const mutationResult = useMutation({
		mutationKey: ['logOut'],
		mutationFn: logOutAction,
		onSuccess: () => {
			syncUserState();
		},
	});

	return mutationResult;
};
