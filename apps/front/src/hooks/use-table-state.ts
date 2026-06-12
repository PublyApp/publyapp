import type { OnChangeFn } from '@tanstack/react-table';
import isFunction from 'lodash/isFunction';
import merge from 'lodash/merge';
import type {
	MRT_PaginationState,
	MRT_SortingState,
} from 'material-react-table';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useCallback, useRef, useState } from 'react';

import { DEFAULT_PAGE_SIZE } from '@org/shared-ts/lib/constants';

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
	paginationMode?: 'offset' | 'cursor';
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
		page?: number;
		cursor?: string | null;
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

	// Cursor-specific fields
	paginationMode: 'offset' | 'cursor';
	setNextCursor?: (cursor: string | null | undefined) => void;
	hasPreviousPage?: boolean;
	resetCursorPagination?: () => void;
};

// Default query keys
const defaultTableQueryKeys: TableQueryKeys = {
	pagination: {
		page: 'page',
		pageSize: 'size',
	},
	sorting: {
		id: 'sort_id',
		order: 'sort_order',
	},
};

const MAX_CURSOR_HISTORY = 50;

export const useTableState = (
	options: UseTableStateOptions,
): UseTableStateReturn => {
	const {
		defaultSorting,
		defaultPageSize = DEFAULT_PAGE_SIZE,
		paginationMode = 'offset',
	} = options;
	const queryKeys = merge({}, defaultTableQueryKeys, options.queryKeys || {});

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

	// Pagination state (conditional based on mode)
	const [paginationState, setPaginationState] = useQueryStates(
		paginationMode === 'offset'
			? {
					[queryKeys.pagination.page]: parseAsString.withDefault('1'),
					[queryKeys.pagination.pageSize]: parseAsString.withDefault(
						defaultPageSize.toString(),
					),
				}
			: {
					[queryKeys.pagination.pageSize]: parseAsString.withDefault(
						defaultPageSize.toString(),
					),
				},
	);

	const sortId = sortingState[queryKeys.sorting.id];
	const sortOrder = sortingState[queryKeys.sorting.order];
	const pageSize = paginationState[queryKeys.pagination.pageSize];

	// Cursor-specific state. Grouped with the sort/pageSize params that produced it so
	// validity can be derived inline (no useEffect reset needed). When sort or pageSize
	// changes the derived values below immediately return empty/null on the same render,
	// preventing the stale-cursor API call that an effect-based reset would allow.
	type CursorState = {
		forSortId: string;
		forSortOrder: string;
		forPageSize: string;
		history: string[];
		current: string | null;
		pageIndex: number;
	};

	const [cursorState, setCursorState] = useState<CursorState>(() => ({
		forSortId: sortId,
		forSortOrder: sortOrder,
		forPageSize: pageSize,
		history: [],
		current: null,
		pageIndex: 0,
	}));

	const isCursorStateFresh =
		cursorState.forSortId === sortId &&
		cursorState.forSortOrder === sortOrder &&
		cursorState.forPageSize === pageSize;

	const currentCursor = isCursorStateFresh ? cursorState.current : null;
	const virtualPageIndex = isCursorStateFresh ? cursorState.pageIndex : 0;

	// Track the next cursor in a ref so pagination updates use the freshest query result.
	const nextCursorRef = useRef<string | null | undefined>(undefined);

	const setNextCursor = useCallback((cursor: string | null | undefined) => {
		nextCursorRef.current = cursor;
	}, []);

	// Explicit reset for cursor pagination when external filters change.
	const resetCursorPagination = useCallback(() => {
		if (paginationMode !== 'cursor') {
			return;
		}
		setCursorState({
			forSortId: sortId,
			forSortOrder: sortOrder,
			forPageSize: pageSize,
			history: [],
			current: null,
			pageIndex: 0,
		});
		setNextCursor(undefined);
	}, [paginationMode, setNextCursor, sortId, sortOrder, pageSize]);

	// Sorting change handler
	const handleSortingChange = useCallback<OnChangeFn<MRT_SortingState>>(
		(
			updaterOrValue:
				| MRT_SortingState
				| ((prev: MRT_SortingState) => MRT_SortingState),
		) => {
			if (isFunction(updaterOrValue)) {
				const { desc, id } = updaterOrValue([
					{
						id: sortingState[queryKeys.sorting.id],
						desc: sortingState[queryKeys.sorting.order] === 'desc',
					},
				])[0] ||
					defaultSorting || { id: 'createdAt', desc: true };
				void setSortingState({
					[queryKeys.sorting.id]: id,
					[queryKeys.sorting.order]: desc === false ? 'asc' : 'desc',
				});
			} else {
				const { desc, id } = updaterOrValue[0] ||
					defaultSorting || { id: 'createdAt', desc: true };
				void setSortingState({
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
			if (paginationMode === 'cursor') {
				// Cursor mode logic
				const newPagination = isFunction(updaterOrValue)
					? updaterOrValue({
							pageIndex: virtualPageIndex,
							pageSize: Number(paginationState[queryKeys.pagination.pageSize]),
						})
					: updaterOrValue;

				const newPageIndex = newPagination.pageIndex;
				const currentPageIndex = virtualPageIndex;
				const currentNextCursor = nextCursorRef.current;
				const baseState = {
					forSortId: sortId,
					forSortOrder: sortOrder,
					forPageSize: pageSize,
				};
				if (newPageIndex > currentPageIndex) {
					// Going forward
					if (currentNextCursor) {
						setCursorState((prev) => {
							const newHistory = currentCursor
								? [...prev.history, currentCursor]
								: prev.history;
							return {
								...baseState,
								history: newHistory.slice(-MAX_CURSOR_HISTORY),
								current: currentNextCursor,
								pageIndex: newPageIndex,
							};
						});
					}
				} else if (newPageIndex < currentPageIndex) {
					// Going backward
					setCursorState((prev) => {
						if (prev.history.length === 0) {
							return { ...baseState, history: [], current: null, pageIndex: 0 };
						}
						const newHistory = [...prev.history];
						const previousCursor = newHistory.pop() ?? null;
						return {
							...baseState,
							history: newHistory,
							current: previousCursor,
							pageIndex: newPageIndex,
						};
					});
				}

				// Handle page size change
				if (
					newPagination.pageSize !==
					Number(paginationState[queryKeys.pagination.pageSize])
				) {
					void setPaginationState({
						[queryKeys.pagination.pageSize]: newPagination.pageSize.toString(),
					});
				}
			} else {
				// Offset mode logic (original behavior)
				if (isFunction(updaterOrValue)) {
					const newPagination = updaterOrValue({
						pageIndex: Number(paginationState[queryKeys.pagination.page]) - 1,
						pageSize: Number(paginationState[queryKeys.pagination.pageSize]),
					});
					void setPaginationState({
						[queryKeys.pagination.page]: (
							newPagination.pageIndex + 1
						).toString(),
						[queryKeys.pagination.pageSize]: newPagination.pageSize.toString(),
					});
				} else {
					void setPaginationState({
						[queryKeys.pagination.page]: (
							updaterOrValue.pageIndex + 1
						).toString(),
						[queryKeys.pagination.pageSize]: updaterOrValue.pageSize.toString(),
					});
				}
			}
		},
		[
			paginationMode,
			paginationState,
			queryKeys.pagination.page,
			queryKeys.pagination.pageSize,
			setPaginationState,
			virtualPageIndex,
			currentCursor,
			sortId,
			sortOrder,
			pageSize,
		],
	);

	// Computed values for API calls
	const apiVariables =
		paginationMode === 'cursor'
			? {
					limit: Number(paginationState[queryKeys.pagination.pageSize]),
					cursor: currentCursor,
					sort: {
						id: sortingState[queryKeys.sorting.id],
						order: sortingState[queryKeys.sorting.order] as 'asc' | 'desc',
					},
				}
			: {
					limit: Number(paginationState[queryKeys.pagination.pageSize]),
					page: Number(paginationState[queryKeys.pagination.page]),
					sort: {
						id: sortingState[queryKeys.sorting.id],
						order: sortingState[queryKeys.sorting.order] as 'asc' | 'desc',
					},
				};

	// Computed values for table state
	const tableState = {
		pagination:
			paginationMode === 'cursor'
				? {
						pageIndex: virtualPageIndex,
						pageSize: Number(paginationState[queryKeys.pagination.pageSize]),
					}
				: {
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

	// Cursor-specific computed values
	const hasPreviousPage =
		paginationMode === 'cursor' ? virtualPageIndex > 0 : undefined;

	return {
		paginationState,
		setPaginationState,
		sortingState,
		setSortingState,
		handlePaginationChange,
		handleSortingChange,
		apiVariables,
		tableState,
		paginationMode,
		setNextCursor: paginationMode === 'cursor' ? setNextCursor : undefined,
		hasPreviousPage,
		resetCursorPagination:
			paginationMode === 'cursor' ? resetCursorPagination : undefined,
	};
};
