import { useMutation } from '@tanstack/react-query';

import { logOutAction } from '../../reactQuery/actions/auth.actions';

export const useLogOutMutation = () => {
	const mutationResult = useMutation({
		mutationKey: ['logOut'],
		mutationFn: logOutAction,
	});

	return mutationResult;
};
