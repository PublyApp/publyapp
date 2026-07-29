export type SelectionLockedSearchAction =
	| 'apply'
	| 'clear-cancel'
	| 'clear-cancel-and-apply'
	| 'none'
	| 'wait';

export const getSelectionLockedSearchAction = ({
	isSelectionMode,
	isCancellingSelectionLockedSearch,
	searchValue,
	debouncedValue,
	persistedValue,
}: {
	isSelectionMode: boolean;
	isCancellingSelectionLockedSearch: boolean;
	searchValue: string;
	debouncedValue: string;
	persistedValue: string;
}): SelectionLockedSearchAction => {
	if (isSelectionMode) {
		return 'none';
	}

	if (isCancellingSelectionLockedSearch) {
		if (debouncedValue !== searchValue) {
			return 'wait';
		}

		if (debouncedValue === persistedValue) {
			return 'clear-cancel';
		}

		return 'clear-cancel-and-apply';
	}

	if (debouncedValue === persistedValue) {
		return 'none';
	}

	return 'apply';
};
