import type { OnChangeFn } from '@tanstack/react-table';
import type { MRT_PaginationState } from 'material-react-table';

/**
 * Metadata for cursor-based pagination tables
 * Pass this via the `meta` prop when using the 'default-cursor' or 'minimal-cursor' presets
 */
export type CursorPaginationMeta = {
	/** Pagination change handler from useTableState */
	handlePaginationChange: OnChangeFn<MRT_PaginationState>;
	/** Whether there's a next page available (from useTableState) */
	hasNextPage?: boolean;
	/** Whether there's a previous page available (from useTableState) */
	hasPreviousPage?: boolean;
	/** Whether data is currently loading */
	isPending?: boolean;
};
