type QueryState<TData, TError = Error> = {
	isPending: boolean;
	data: TData;
};

export const checkIfEmptyQueryData = <TData = unknown, TError = Error>(
	query: QueryState<TData, TError>,
): boolean => {
	const isEmpty =
		query.data === undefined ||
		query.data === null ||
		(Array.isArray(query.data) && query.data.length === 0);

	return !query.isPending && isEmpty;
};
