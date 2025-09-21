import { DEFAULT_PAGE_SIZE } from '@/shared/lib/constants';
import type { OnChangeFn } from '@tanstack/react-table';
import _ from 'lodash';
import type {
	MRT_PaginationState,
	MRT_SortingState,
} from 'material-react-table';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useCallback } from 'react';

export type TableQueryKeys = {
	pagination: {
		page: string;
		pageSize: string;
	};
	sorting: {
		id: string;
		order: string;
	};
};

export type UseTableStateOptions = {
	queryKeys?: TableQueryKeys;
	defaultSorting?: MRT_SortingState[number];
	defaultPageSize?: number;
};

export type UseTableStateReturn = {
	// Pagination state
	paginationState: Record<string, string>;
	setPaginationState: (
		updater:
			| Record<string, string>
			| ((prev: Record<string, string>) => Record<string, string>),
	) => void;

	// Sorting state
	sortingState: Record<string, string>;
	setSortingState: (
		updater:
			| Record<string, string>
			| ((prev: Record<string, string>) => Record<string, string>),
	) => void;

	// Handlers
	handlePaginationChange: OnChangeFn<MRT_PaginationState>;
	handleSortingChange: OnChangeFn<MRT_SortingState>;

	// Computed values for API calls
	apiVariables: {
		limit: number;
		page: number;
		sort: {
			id: string;
			order: 'asc' | 'desc';
		};
	};

	// Computed values for table state
	tableState: {
		pagination: MRT_PaginationState;
		sorting: MRT_SortingState;
	};
};

// Default query keys
const defaultTableQueryKeys: TableQueryKeys = {
	pagination: {
		page: 'page',
		pageSize: 'size',
	},
	sorting: {
		id: 'id',
		order: 'order',
	},
};

export const useTableState = (
	options: UseTableStateOptions,
): UseTableStateReturn => {
	const { defaultSorting, defaultPageSize = DEFAULT_PAGE_SIZE } = options;
	const queryKeys = _.merge({}, defaultTableQueryKeys, options.queryKeys || {});

	const _sortOrder = ['asc', 'desc'] as const;

	// Sorting state
	const [sortingState, setSortingState] = useQueryStates({
		[queryKeys.sorting.id]: parseAsString.withDefault(
			defaultSorting?.id || 'createdAt',
		),
		[queryKeys.sorting.order]: parseAsStringLiteral(_sortOrder).withDefault(
			defaultSorting?.desc ? 'desc' : 'asc',
		),
	});

	// Pagination state
	const [paginationState, setPaginationState] = useQueryStates({
		[queryKeys.pagination.page]: parseAsString.withDefault('1'),
		[queryKeys.pagination.pageSize]: parseAsString.withDefault(
			defaultPageSize.toString(),
		),
	});

	// Sorting change handler
	const handleSortingChange = useCallback<OnChangeFn<MRT_SortingState>>(
		(
			updaterOrValue:
				| MRT_SortingState
				| ((prev: MRT_SortingState) => MRT_SortingState),
		) => {
			if (_.isFunction(updaterOrValue)) {
				const { desc, id } = updaterOrValue([
					{
						id: sortingState[queryKeys.sorting.id],
						desc: sortingState[queryKeys.sorting.order] === 'desc',
					},
				])[0] ||
					defaultSorting || { id: 'createdAt', desc: true };
				setSortingState({
					[queryKeys.sorting.id]: id,
					[queryKeys.sorting.order]: desc === false ? 'asc' : 'desc',
				});
			} else {
				const { desc, id } = updaterOrValue[0] ||
					defaultSorting || { id: 'createdAt', desc: true };
				setSortingState({
					[queryKeys.sorting.id]: id,
					[queryKeys.sorting.order]: desc === false ? 'asc' : 'desc',
				});
			}
		},
		[
			sortingState,
			queryKeys.sorting.id,
			queryKeys.sorting.order,
			setSortingState,
			defaultSorting,
		],
	);

	// Pagination change handler
	const handlePaginationChange = useCallback<OnChangeFn<MRT_PaginationState>>(
		(
			updaterOrValue:
				| MRT_PaginationState
				| ((prev: MRT_PaginationState) => MRT_PaginationState),
		) => {
			if (_.isFunction(updaterOrValue)) {
				const newPagination = updaterOrValue({
					pageIndex: Number(paginationState[queryKeys.pagination.page]) - 1,
					pageSize: Number(paginationState[queryKeys.pagination.pageSize]),
				});
				setPaginationState({
					[queryKeys.pagination.page]: (newPagination.pageIndex + 1).toString(),
					[queryKeys.pagination.pageSize]: newPagination.pageSize.toString(),
				});
			} else {
				setPaginationState({
					[queryKeys.pagination.page]: (
						updaterOrValue.pageIndex + 1
					).toString(),
					[queryKeys.pagination.pageSize]: updaterOrValue.pageSize.toString(),
				});
			}
		},
		[
			paginationState,
			queryKeys.pagination.page,
			queryKeys.pagination.pageSize,
			setPaginationState,
		],
	);

	// Computed values for API calls
	const apiVariables = {
		limit: Number(paginationState[queryKeys.pagination.pageSize]),
		page: Number(paginationState[queryKeys.pagination.page]),
		sort: {
			id: sortingState[queryKeys.sorting.id],
			order: sortingState[queryKeys.sorting.order] as 'asc' | 'desc',
		},
	};

	// Computed values for table state
	const tableState = {
		pagination: {
			pageIndex: Number(paginationState[queryKeys.pagination.page]) - 1,
			pageSize: Number(paginationState[queryKeys.pagination.pageSize]),
		},
		sorting: [
			{
				id: sortingState[queryKeys.sorting.id],
				desc: sortingState[queryKeys.sorting.order] === 'desc',
			},
		],
	};

	return {
		paginationState,
		setPaginationState,
		sortingState,
		setSortingState,
		handlePaginationChange,
		handleSortingChange,
		apiVariables,
		tableState,
	};
};
