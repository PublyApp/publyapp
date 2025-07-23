import type { UseQueryResult } from '@tanstack/react-query';

export const checkIfEmptyQueryData = <TData = unknown, TError = Error>(
	query: UseQueryResult<TData, TError>,
) => {
	const isEmpty =
		query.data === undefined ||
		query.data === null ||
		(Array.isArray(query.data) && query.data.length === 0);

	return isEmpty;
};
