import type { OnChangeFn } from '@tanstack/react-table';
import _ from 'lodash';
import type {
	MRT_PaginationState,
	MRT_SortingState,
} from 'material-react-table';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useCallback, useEffect, useRef, useState } from 'react';

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
	hasNextPage?: boolean;
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

	// Cursor-specific state (only used in cursor mode)
	const [_cursorHistory, setCursorHistory] = useState<string[]>([]);
	const [currentCursor, setCurrentCursor] = useState<string | null>(null);
	const [virtualPageIndex, setVirtualPageIndex] = useState(0);
	// Track the next cursor in state so pagination updates stay explicit.
	const [nextCursor, setNextCursorState] = useState<string | null | undefined>(
		undefined,
	);
	const nextCursorRef = useRef<string | null | undefined>(undefined);

	const setNextCursor = useCallback((cursor: string | null | undefined) => {
		nextCursorRef.current = cursor;
		setNextCursorState(cursor);
	}, []);

	// Explicit reset for cursor pagination when external filters change.
	const resetCursorPagination = useCallback(() => {
		if (paginationMode !== 'cursor') {
			return;
		}
		setCursorHistory([]);
		setCurrentCursor(null);
		setNextCursor(undefined);
		setVirtualPageIndex(0);
	}, [paginationMode, setNextCursor]);

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

	// Reset cursor history when sorting or page size changes in cursor mode
	// All dependencies are intentional (not accidental)
	// Why they're needed: cursors become invalid when query params change
	// What would break: without these deps, users would see invalid data when changing sort/size
	useEffect(() => {
		if (paginationMode === 'cursor') {
			setCursorHistory([]);
			setCurrentCursor(null);
			setVirtualPageIndex(0);
		}
	}, [
		paginationMode,
		// oxlint-disable-next-line react/exhaustive-deps -- All dependencies are intentional (not accidental)
		sortingState[queryKeys.sorting.id],
		// oxlint-disable-next-line react/exhaustive-deps -- All dependencies are intentional (not accidental)
		sortingState[queryKeys.sorting.order],
		// oxlint-disable-next-line react/exhaustive-deps -- All dependencies are intentional (not accidental)
		paginationState[queryKeys.pagination.pageSize],
	]);

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
			if (paginationMode === 'cursor') {
				// Cursor mode logic
				const newPagination = _.isFunction(updaterOrValue)
					? updaterOrValue({
							pageIndex: virtualPageIndex,
							pageSize: Number(paginationState[queryKeys.pagination.pageSize]),
						})
					: updaterOrValue;

				const newPageIndex = newPagination.pageIndex;
				const currentPageIndex = virtualPageIndex;
				const currentNextCursor = nextCursorRef.current;
				if (newPageIndex > currentPageIndex) {
					// Going forward
					if (currentNextCursor) {
						// Push current cursor to history (limit to MAX_CURSOR_HISTORY)
						setCursorHistory((prev) => {
							const newHistory = currentCursor
								? [...prev, currentCursor]
								: prev;
							// Keep only the last MAX_CURSOR_HISTORY items
							return newHistory.slice(-MAX_CURSOR_HISTORY);
						});
						setCurrentCursor(currentNextCursor);
						setVirtualPageIndex(newPageIndex);
					}
				} else if (newPageIndex < currentPageIndex) {
					// Going backward
					setCursorHistory((prev) => {
						if (prev.length === 0) {
							// Back to first page
							setCurrentCursor(null);
							setVirtualPageIndex(0);
							return [];
						}

						// Pop last cursor from history
						const newHistory = [...prev];
						const previousCursor = newHistory.pop();
						setCurrentCursor(previousCursor || null);
						setVirtualPageIndex(newPageIndex);
						return newHistory;
					});
				}

				// Handle page size change
				if (
					newPagination.pageSize !==
					Number(paginationState[queryKeys.pagination.pageSize])
				) {
					setPaginationState({
						[queryKeys.pagination.pageSize]: newPagination.pageSize.toString(),
					});
				}
			} else {
				// Offset mode logic (original behavior)
				if (_.isFunction(updaterOrValue)) {
					const newPagination = updaterOrValue({
						pageIndex: Number(paginationState[queryKeys.pagination.page]) - 1,
						pageSize: Number(paginationState[queryKeys.pagination.pageSize]),
					});
					setPaginationState({
						[queryKeys.pagination.page]: (
							newPagination.pageIndex + 1
						).toString(),
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
	const hasNextPage =
		paginationMode === 'cursor'
			? nextCursor !== null && nextCursor !== undefined
			: undefined;

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
		hasNextPage,
		hasPreviousPage,
		resetCursorPagination:
			paginationMode === 'cursor' ? resetCursorPagination : undefined,
	};
};
