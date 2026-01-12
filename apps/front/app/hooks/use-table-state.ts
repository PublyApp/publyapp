import type { OnChangeFn } from '@tanstack/react-table';
import _ from 'lodash';
import type {
	MRT_PaginationState,
	MRT_SortingState,
} from 'material-react-table';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PAGE_SIZE } from '@/shared/lib/constants';
import { logger } from '@/shared/lib/logger/iso-logger';

export type TableQueryKeys = {
	pagination: {
		page: string;
		pageSize: string;
		cursor?: string; // Optional cursor key for cursor mode
	};
	sorting: {
		id: string;
		order: string;
	};
};

export type PaginationMode = 'page' | 'cursor';

export type UseTableStateOptions = {
	queryKeys?: TableQueryKeys;
	defaultSorting?: MRT_SortingState[number];
	defaultPageSize?: number;
	paginationMode?: PaginationMode;
};

// Base return type without cursor methods
type UseTableStateReturnBase = {
	// Pagination state
	paginationState: Record<string, string | null>;
	setPaginationState: (
		updater:
			| Record<string, string | null>
			| ((
					prev: Record<string, string | null>,
			  ) => Record<string, string | null>),
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

	// Computed values for table state
	tableState: {
		pagination: MRT_PaginationState;
		sorting: MRT_SortingState;
	};
};

// Return type for page mode
export type UseTableStateReturnPage = UseTableStateReturnBase & {
	// Computed values for API calls
	apiVariables: {
		limit: number;
		page: number;
		sort: {
			id: string;
			order: 'asc' | 'desc';
		};
	};
};

// Return type for cursor mode
export type UseTableStateReturnCursor = UseTableStateReturnBase & {
	// Cursor management (required in cursor mode)
	setNextCursor: (cursor: string | null) => void;
	resetCursor: () => void;
	hasMorePages: boolean; // Track if there are more pages available

	// Computed values for API calls
	apiVariables: {
		limit: number;
		cursor: string | null;
		sort: {
			id: string;
			order: 'asc' | 'desc';
		};
	};
};

// Union type for backward compatibility (when mode is not specified)
export type UseTableStateReturn =
	| UseTableStateReturnPage
	| UseTableStateReturnCursor;

// Constants
const DEFAULT_SORTING = { id: 'createdAt', desc: true };

const defaultTableQueryKeys: TableQueryKeys = {
	pagination: {
		page: 'page',
		pageSize: 'size',
		cursor: 'cursor',
	},
	sorting: {
		id: 'sort_id',
		order: 'sort_order',
	},
};

// Overloaded function signatures
export function useTableState(
	options: UseTableStateOptions & { paginationMode: 'cursor' },
): UseTableStateReturnCursor;
export function useTableState(
	options: UseTableStateOptions & { paginationMode: 'page' },
): UseTableStateReturnPage;
export function useTableState(
	options?: UseTableStateOptions,
): UseTableStateReturnPage;
export function useTableState(
	options: UseTableStateOptions = {},
): UseTableStateReturnPage | UseTableStateReturnCursor {
	const {
		defaultSorting,
		defaultPageSize = DEFAULT_PAGE_SIZE,
		paginationMode = 'page',
	} = options;
	const queryKeys = _.merge({}, defaultTableQueryKeys, options.queryKeys || {});

	const _sortOrder = ['asc', 'desc'] as const;

	// Define cursor key once to avoid repetition
	const cursorKey = queryKeys.pagination.cursor ?? 'cursor';
	const pageKey = queryKeys.pagination.page;
	const pageSizeKey = queryKeys.pagination.pageSize;

	// Track page index for cursor mode (not in URL, but in component state)
	// This is needed for MaterialReactTable UI, but won't be synced to URL
	const [cursorPageIndex, setCursorPageIndex] = useState<number>(0);

	// Track if there are more pages in cursor mode
	const [hasMorePages, setHasMorePages] = useState<boolean>(true);

	// Sorting state
	const [sortingState, setSortingState] = useQueryStates({
		[queryKeys.sorting.id]: parseAsString.withDefault(
			defaultSorting?.id || DEFAULT_SORTING.id,
		),
		[queryKeys.sorting.order]: parseAsStringLiteral(_sortOrder).withDefault(
			defaultSorting?.desc ? 'desc' : DEFAULT_SORTING.desc ? 'desc' : 'asc',
		),
	});

	// Pagination state - conditionally include page/cursor based on mode
	const [paginationState, setPaginationState] = useQueryStates({
		[pageSizeKey]: parseAsString.withDefault(defaultPageSize.toString()),
		// Only include page in page mode
		...(paginationMode === 'page' && {
			[pageKey]: parseAsString.withDefault('1'),
		}),
		// Only include cursor in cursor mode
		...(paginationMode === 'cursor' && {
			[cursorKey]: parseAsString,
		}),
	});

	// Clean up unused query params on mount and when mode changes
	// Only update if cleanup is actually needed to avoid unnecessary re-renders
	useEffect(() => {
		setPaginationState((prev) => {
			const needsCleanup =
				paginationMode === 'cursor' ? pageKey in prev : cursorKey in prev;

			// If no cleanup needed, return previous state to prevent re-render
			if (!needsCleanup) return prev;

			const newState = { ...prev };

			if (paginationMode === 'cursor') {
				// Remove page param in cursor mode
				delete newState[pageKey];
			} else {
				// Remove cursor param in page mode
				delete newState[cursorKey];
			}

			return newState;
		});
	}, [paginationMode, setPaginationState, pageKey, cursorKey]);

	// Helper to update pagination state and remove unused params
	const updatePaginationState = useCallback(
		(updates: Record<string, string | null>) => {
			setPaginationState((prev) => {
				const newState = { ...prev, ...updates };

				// Remove unused param based on mode
				if (paginationMode === 'cursor') {
					delete newState[pageKey];
				} else {
					delete newState[cursorKey];
				}

				return newState;
			});
		},
		[paginationMode, setPaginationState, pageKey, cursorKey],
	);

	// Reset cursor helper (only used in cursor mode)
	const resetCursor = useCallback(() => {
		if (paginationMode !== 'cursor') {
			if (import.meta.env.DEV) {
				logger.warn('resetCursor called in page mode - ignoring');
			}
			return;
		}

		updatePaginationState({
			[cursorKey]: null,
		});
		setCursorPageIndex(0); // Reset page index
		setHasMorePages(true); // Reset to true when resetting cursor
	}, [paginationMode, updatePaginationState, cursorKey]);

	// Set next cursor from API response (only used in cursor mode)
	const setNextCursor = useCallback(
		(cursor: string | null) => {
			if (paginationMode !== 'cursor') {
				if (import.meta.env.DEV) {
					logger.warn('setNextCursor called in page mode - ignoring');
				}
				return;
			}

			// Update hasMorePages based on cursor presence
			setHasMorePages(cursor !== null);

			if (cursor) {
				updatePaginationState({
					[cursorKey]: cursor,
				});
			} else {
				// No more pages - clear cursor but don't reset page index
				updatePaginationState({
					[cursorKey]: null,
				});
			}
		},
		[paginationMode, updatePaginationState, cursorKey],
	);

	// Sorting change handler
	const handleSortingChange = useCallback<OnChangeFn<MRT_SortingState>>(
		(
			updaterOrValue:
				| MRT_SortingState
				| ((prev: MRT_SortingState) => MRT_SortingState),
		) => {
			// Determine new sorting value
			const newSorting = _.isFunction(updaterOrValue)
				? updaterOrValue([
						{
							id: sortingState[queryKeys.sorting.id],
							desc: sortingState[queryKeys.sorting.order] === 'desc',
						},
					])[0] ||
					defaultSorting ||
					DEFAULT_SORTING
				: updaterOrValue[0] || defaultSorting || DEFAULT_SORTING;

			const { desc, id } = newSorting;

			// Update sorting state
			setSortingState({
				[queryKeys.sorting.id]: id,
				[queryKeys.sorting.order]: desc === false ? 'asc' : 'desc',
			});

			// Reset pagination when sorting changes
			if (paginationMode === 'cursor') {
				resetCursor();
			} else {
				updatePaginationState({
					[pageKey]: '1',
				});
			}
		},
		[
			sortingState,
			queryKeys.sorting.id,
			queryKeys.sorting.order,
			setSortingState,
			defaultSorting,
			paginationMode,
			resetCursor,
			updatePaginationState,
			pageKey,
		],
	);

	// Pagination change handler
	const handlePaginationChange = useCallback<OnChangeFn<MRT_PaginationState>>(
		(
			updaterOrValue:
				| MRT_PaginationState
				| ((prev: MRT_PaginationState) => MRT_PaginationState),
		) => {
			// Get current page index - use from state or default to 0
			const currentPageIndex =
				paginationMode === 'page'
					? Number(paginationState[pageKey] || '1') - 1
					: cursorPageIndex;
			const currentPageSize = Number(paginationState[pageSizeKey]);

			// Determine new pagination value
			const newPagination = _.isFunction(updaterOrValue)
				? updaterOrValue({
						pageIndex: currentPageIndex,
						pageSize: currentPageSize,
					})
				: updaterOrValue;

			// Handle cursor mode
			if (paginationMode === 'cursor') {
				// If page size changed, reset cursor
				if (newPagination.pageSize !== currentPageSize) {
					resetCursor();
					updatePaginationState({
						[pageSizeKey]: newPagination.pageSize.toString(),
					});
					return;
				}

				// If going backward or jumping to a different page, reset cursor
				if (
					newPagination.pageIndex < cursorPageIndex ||
					newPagination.pageIndex !== cursorPageIndex + 1
				) {
					resetCursor();
					updatePaginationState({
						[pageSizeKey]: newPagination.pageSize.toString(),
					});
					setCursorPageIndex(newPagination.pageIndex);
					return;
				}

				// Going forward sequentially - keep cursor (will be updated from API response)
				updatePaginationState({
					[pageSizeKey]: newPagination.pageSize.toString(),
				});
				setCursorPageIndex(newPagination.pageIndex);
				return;
			}

			// Handle page mode - simple page-based pagination
			updatePaginationState({
				[pageKey]: (newPagination.pageIndex + 1).toString(),
				[pageSizeKey]: newPagination.pageSize.toString(),
			});
		},
		[
			paginationState,
			pageKey,
			pageSizeKey,
			paginationMode,
			cursorPageIndex,
			resetCursor,
			updatePaginationState,
		],
	);

	// Computed values for API calls
	const apiVariables =
		paginationMode === 'cursor'
			? {
					limit: Number(paginationState[pageSizeKey]),
					cursor: paginationState[cursorKey] || null,
					sort: {
						id: sortingState[queryKeys.sorting.id],
						order: sortingState[queryKeys.sorting.order] as 'asc' | 'desc',
					},
				}
			: {
					limit: Number(paginationState[pageSizeKey]),
					page: Number(paginationState[pageKey] || '1'),
					sort: {
						id: sortingState[queryKeys.sorting.id],
						order: sortingState[queryKeys.sorting.order] as 'asc' | 'desc',
					},
				};

	// Computed values for table state
	const tableState = {
		pagination: {
			pageIndex:
				paginationMode === 'page'
					? Number(paginationState[pageKey] || '1') - 1
					: cursorPageIndex,
			pageSize: Number(paginationState[pageSizeKey]),
		},
		sorting: [
			{
				id: sortingState[queryKeys.sorting.id],
				desc: sortingState[queryKeys.sorting.order] === 'desc',
			},
		],
	};

	// Base return object
	const baseReturn: UseTableStateReturnBase = {
		paginationState,
		setPaginationState,
		sortingState,
		setSortingState,
		handlePaginationChange,
		handleSortingChange,
		tableState,
	};

	// Return typed based on mode
	if (paginationMode === 'cursor') {
		return {
			...baseReturn,
			setNextCursor,
			resetCursor,
			hasMorePages,
			apiVariables,
		} as UseTableStateReturnCursor;
	}

	return {
		...baseReturn,
		apiVariables,
	} as UseTableStateReturnPage;
}
