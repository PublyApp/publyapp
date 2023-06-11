import { useMutation } from '@tanstack/react-query';

import { logInAction, logOutAction } from './auth.actions';

export const useLogInMutation = () => {
	const mutationResult = useMutation({
		mutationKey: ['logIn'],
		mutationFn: logInAction,
	});

	return mutationResult;
};

export const useLogOutMutation = () => {
	const mutationResult = useMutation({
		mutationKey: ['logOut'],
		mutationFn: logOutAction,
	});

	return mutationResult;
};
