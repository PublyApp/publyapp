type QueryState<TData> = {
	isPending: boolean;
	data: TData;
};

export const checkIfEmptyQueryData = <TData = unknown>(
	query: QueryState<TData>,
): boolean => {
	const isEmpty =
		query.data === undefined ||
		query.data === null ||
		(Array.isArray(query.data) && query.data.length === 0);

	return !query.isPending && isEmpty;
};
