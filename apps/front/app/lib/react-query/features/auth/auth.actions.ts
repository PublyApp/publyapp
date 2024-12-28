import { queryOptions, type QueryFunctionContext } from '@tanstack/react-query';

import { sleep } from '@/shared/utils/any.utils';

// ---- 1 --------------------------------------------------------------------------------
export const checkSessionTokenQueryKeyBase = 'checkSessionToken' as const;

export const checkSessionTokenAction = async (
	_context: QueryFunctionContext<readonly [typeof checkSessionTokenQueryKeyBase]>,
) => {
	const result = await sleep(1000, { user: { name: 'John Doe' } });
	return result;
};

export const getCheckSessionTokenQueryOptions = () => {
	return queryOptions({
		queryKey: [checkSessionTokenQueryKeyBase] as const,
		queryFn: checkSessionTokenAction,
	});
};
