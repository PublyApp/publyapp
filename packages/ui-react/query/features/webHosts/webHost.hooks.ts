import { useMutation } from '@tanstack/react-query';

import { functionName } from '@devist/shared/utils/constants';

import { createWebHostAction } from './webHost.actions';

export const useCreateWebHost = () => {
	const key = [functionName.createWebHost] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: createWebHostAction,
	});

	return { result, key };
};
