import { useMutation } from '@tanstack/react-query';

import { logInAction } from '../../reactQuery/actions/auth.actions';

export const useLogInMutation = () => {
	const mutationResult = useMutation({
		mutationKey: ['logIn'],
		mutationFn: logInAction,
	});

	return mutationResult;
};
