import type { OnChangeFn } from '@tanstack/react-table';
import type {
	MRT_PaginationState,
	MRT_RowData,
	MRT_TableInstance,
} from 'material-react-table';
import type { ReactNode } from 'react';

export type SharedToolbarContext<TData extends MRT_RowData = MRT_RowData> = {
	table: MRT_TableInstance<TData>;
	isSelectionMode: boolean;
	selectedRowsCount: number;
};

export type SharedToolbarMeta<TData extends MRT_RowData = MRT_RowData> = {
	renderToolbarFilters?: (context: SharedToolbarContext<TData>) => ReactNode;
	renderToolbarActions?: (context: SharedToolbarContext<TData>) => ReactNode;
	renderSelectionActions?: (context: SharedToolbarContext<TData>) => ReactNode;
	renderExportActions?: (context: SharedToolbarContext<TData>) => ReactNode;
	disablePaginationControls?: boolean;
};

/**
 * Metadata for cursor-based pagination tables
 * Pass this via the `meta` prop when using the 'default-cursor' or 'minimal-cursor' presets
 */
export type CursorPaginationMeta<TData extends MRT_RowData = MRT_RowData> =
	SharedToolbarMeta<TData> & {
		/** Pagination change handler from useTableState */
		handlePaginationChange: OnChangeFn<MRT_PaginationState>;
		/** Whether there's a next page available (from useTableState) */
		hasNextPage?: boolean;
		/** Whether there's a previous page available (from useTableState) */
		hasPreviousPage?: boolean;
		/** Whether data is currently loading */
		isPending?: boolean;
	};
