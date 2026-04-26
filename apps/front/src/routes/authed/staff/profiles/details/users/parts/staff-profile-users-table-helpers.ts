type RowSelection = Record<string, boolean>;
type RowWithId = {
	id: string;
};

export const reconcileVisibleProfileUserRowSelection = <TRow extends RowWithId>(
	rowSelection: RowSelection,
	rows: readonly TRow[],
) => {
	const visibleRowIds = new Set(rows.map((row) => row.id));
	const nextRowSelection: RowSelection = {};

	for (const [rowId, isSelected] of Object.entries(rowSelection)) {
		if (isSelected && visibleRowIds.has(rowId)) {
			nextRowSelection[rowId] = true;
		}
	}

	return nextRowSelection;
};

export const getVisibleSelectedRows = <TRow extends RowWithId>(
	rows: readonly TRow[],
	rowSelection: RowSelection,
) => {
	return rows.filter((row) => {
		return rowSelection[row.id];
	});
};

export const getProfileUsersDebouncedSearchAction = ({
	isSelectionMode,
	isCancellingSelectionLockedSearch,
	debouncedQuery,
	persistedQuery,
}: {
	isSelectionMode: boolean;
	isCancellingSelectionLockedSearch: boolean;
	debouncedQuery: string;
	persistedQuery: string;
}) => {
	if (isSelectionMode) {
		return 'none' as const;
	}

	if (isCancellingSelectionLockedSearch) {
		if (debouncedQuery !== persistedQuery) {
			return 'wait' as const;
		}

		return 'clear-cancel' as const;
	}

	if (debouncedQuery === persistedQuery) {
		return 'none' as const;
	}

	return 'apply' as const;
};
