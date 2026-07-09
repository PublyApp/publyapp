import type { SortingState } from '@tanstack/react-table';
import type { SortOrder } from '~/lib/url-state/table-search-params';

export type SortState = { id: string; order: SortOrder };

export type TableSortDescriptor = {
	column?: string;
	direction?: 'ascending' | 'descending';
};

/** `@tanstack/react-table` manual sorting state ← our single-column sort. */
export const toSortingState = (sort: SortState): SortingState => [
	{ id: sort.id, desc: sort.order === 'desc' },
];

/** TanStack `SortingState` → local table-sort descriptor. */
export const toTableSortDescriptor = (
	sorting: SortingState,
): TableSortDescriptor | undefined => {
	const primarySort = sorting.at(0);
	if (!primarySort) {
		return undefined;
	}

	return {
		column: primarySort.id,
		direction: primarySort.desc ? 'descending' : 'ascending',
	};
};

/** local table-sort descriptor → app `SortState`. */
export const fromTableSortDescriptor = (
	descriptor: TableSortDescriptor | undefined,
): SortState | undefined => {
	if (!descriptor?.column) {
		return undefined;
	}

	return {
		id: String(descriptor.column),
		order: descriptor.direction === 'descending' ? 'desc' : 'asc',
	};
};
