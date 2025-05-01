import type { UseQueryResult } from '@tanstack/react-query';

export const checkIfEmptyQueryData = (query: UseQueryResult) => {
	const isEmpty =
		query.data === undefined ||
		query.data === null ||
		(Array.isArray(query.data) && query.data.length === 0);

	return isEmpty;
};
