import type { SortDescriptor } from '@heroui/react';
import type { SortingState } from '@tanstack/react-table';
import type { SortOrder } from '~/lib/url-state/table-search-params';

export type SortState = { id: string; order: SortOrder };

/** `@tanstack/react-table` manual sorting state ← our single-column sort. */
export const toSortingState = (sort: SortState): SortingState => [
	{ id: sort.id, desc: sort.order === 'desc' },
];

/** HeroUI `Table.Content` sortDescriptor ← TanStack `SortingState`. */
export const toTableSortDescriptor = (
	sorting: SortingState,
): SortDescriptor | undefined => {
	const primarySort = sorting.at(0);
	if (!primarySort) {
		return undefined;
	}

	return {
		column: primarySort.id,
		direction: primarySort.desc ? 'descending' : 'ascending',
	};
};

/** Our single-column sort ← HeroUI `Table.Content` onSortChange payload. */
export const fromTableSortDescriptor = (
	descriptor: SortDescriptor | undefined,
): SortState | undefined => {
	if (!descriptor?.column) {
		return undefined;
	}

	return {
		id: String(descriptor.column),
		order: descriptor.direction === 'descending' ? 'desc' : 'asc',
	};
};
