import { useSuspenseQuery } from '@tanstack/react-query';

import { functionName } from '@devist/shared/lib/constants';

import { findAppFileAction, type FindAppFileQueryParams } from './appFile.actions';

export const useFindAppFileSuspense = (params: FindAppFileQueryParams) => {
	const key = [functionName.findAppFile, params] as const;

	const result = useSuspenseQuery({
		queryKey: key,
		queryFn: findAppFileAction,
		// placeholderData: keepPreviousData,
	});

	return { result, key };
};
