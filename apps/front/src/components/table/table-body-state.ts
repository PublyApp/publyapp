export type TableBodyState =
	| 'loading'
	| 'error'
	| 'empty'
	| 'no-match'
	| 'rows';

export type ResolveTableBodyStateParams = {
	isPending: boolean;
	isError: boolean;
	rowCount: number;
	/** Whether a search/filter is currently narrowing the result set. */
	hasActiveSearch: boolean;
};

/**
 * `no-match` (zero rows while a search is active) is distinct from `empty`
 * (zero rows, no filters) — the current app collapses both into one empty
 * state; front is required to tell them apart.
 */
export const resolveTableBodyState = ({
	isPending,
	isError,
	rowCount,
	hasActiveSearch,
}: ResolveTableBodyStateParams): TableBodyState => {
	if (isPending) {
		return 'loading';
	}

	if (isError) {
		return 'error';
	}

	if (rowCount === 0) {
		if (hasActiveSearch) {
			return 'no-match';
		}
		return 'empty';
	}

	return 'rows';
};
