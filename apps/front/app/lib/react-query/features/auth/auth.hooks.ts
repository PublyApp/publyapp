import { useSuspenseQuery } from '@tanstack/react-query';

import { getCheckSessionTokenQueryOptions } from './auth.actions';

// ---- 1 --------------------------------------------------------------------------------
type UseCheckSessionTokenQueryProps = {
	options?: Omit<ReturnType<typeof getCheckSessionTokenQueryOptions>, 'queryKey' | 'queryFn'>;
};

export const useCheckSessionTokenQuery = (props?: UseCheckSessionTokenQueryProps) => {
	const query = getCheckSessionTokenQueryOptions();

	return useSuspenseQuery({
		...query,
		...props?.options,
	});
};
