import {
	IconChevronLeft,
	IconChevronRight,
	type TablerIcon,
} from '@tabler/icons-react';
import {
	type ColumnDef,
	type VisibilityState,
	getCoreRowModel,
	useReactTable,
} from '@tanstack/react-table';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchInput } from '~/components/ui/search-input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select';
import { PAGE_SIZE_OPTIONS } from '~/lib/url-state/table-search-params';

import { columnDisplayMeta } from './column-display-meta';
import { DataTableGrid } from './data-table-grid';
import { DataTableStates } from './data-table-states';
import { toSortingState } from './sort-descriptor';
import type { SortState } from './sort-descriptor';
import { resolveTableBodyState } from './table-body-state';
import {
	DENSITY_TO_ROW_HEIGHT,
	TABLE_DEFAULT_ROW_HEIGHT,
} from './table-row-height';
import type { TableDensity, TableRowHeight } from './table-row-height';
import {
	collectDisplayBreakpoints,
	useMatchedBreakpoints,
} from './use-matched-breakpoints';
import type { UseRowSelectionResult } from './use-row-selection';

export type { TableRowHeight };

/**
 * Shared i18n key for the "disabled while rows are selected" tooltip title —
 * export it so route-level tables don't hand-roll their own duplicate
 * literal (see tenants/$tenantId/profiles.tsx's now-removed local copy).
 */
export const SELECTION_LOCKED_TITLE_KEY = 'selection-locked-while-selecting';

export type DataTableToolbarProps = {
	testId: string;
	/**
	 * Both omitted together hides the search input entirely — for a list
	 * whose backend has no search contract, rendering a text box that quietly
	 * does nothing is a lie about what the product can do (users-auth-r6-F2).
	 * Every list with a real search contract must keep passing both.
	 */
	searchDraft?: string;
	onSearchDraftChange?: (value: string) => void;
	searchPlaceholder?: string;
	disabled?: boolean;
	disabledTitle?: string;
	toolbarEnd?: ReactNode;
};

/** Search input + toolbarEnd slot. Extracted so non-table list surfaces (e.g.
 * a card grid) can share the exact toolbar DataTable renders. */
export const DataTableToolbar = ({
	testId,
	searchDraft,
	onSearchDraftChange,
	searchPlaceholder,
	disabled = false,
	disabledTitle,
	toolbarEnd,
}: DataTableToolbarProps) => {
	const { t } = useTranslation('common');
	const resolvedPlaceholder = searchPlaceholder ?? t('search');

	return (
		<div className="publy-data-table-toolbar" data-testid={`${testId}-toolbar`}>
			{onSearchDraftChange ? (
				<SearchInput
					aria-label={t('search')}
					size="table"
					value={searchDraft ?? ''}
					onValueChange={onSearchDraftChange}
					disabled={disabled}
					title={disabled ? disabledTitle : undefined}
					placeholder={resolvedPlaceholder}
					clearLabel={t('clear-search')}
					data-testid={`${testId}-search`}
				/>
			) : null}
			{toolbarEnd ? (
				<div className="publy-data-table-toolbar-end">{toolbarEnd}</div>
			) : null}
		</div>
	);
};

export type DataTableCursorFooterProps = {
	testId: string;
	pageIndex: number;
	size: number;
	onSizeChange: (nextSize: number) => void;
	hasPreviousPage: boolean;
	hasNextPage: boolean;
	isPaginationPending: boolean;
	onNextPage: () => void;
	onPreviousPage: () => void;
	disabled?: boolean;
	disabledTitle?: string;
	/** Renders without the enclosing card's background/border-top, for list
	 * surfaces (e.g. a card grid) whose footer sits directly on the page. */
	variant?: 'card' | 'flat';
};

/** "Rows per page" + Previous/Next cursor pager. Extracted so non-table list
 * surfaces can share the exact footer DataTable renders. */
export const DataTableCursorFooter = ({
	testId,
	pageIndex,
	size,
	onSizeChange,
	hasPreviousPage,
	hasNextPage,
	isPaginationPending,
	onNextPage,
	onPreviousPage,
	disabled = false,
	disabledTitle,
	variant = 'card',
}: DataTableCursorFooterProps) => {
	const { t } = useTranslation('common');
	const paginationDisabled = disabled || isPaginationPending;

	return (
		<div
			className={
				variant === 'flat'
					? 'publy-data-table-footer publy-data-table-footer--flat'
					: 'publy-data-table-footer'
			}
			data-testid={`${testId}-footer`}
		>
			<div className="flex items-center gap-2">
				<span data-slot="page-label" data-testid={`${testId}-page-label`}>
					{t('page-n', { page: pageIndex + 1 })}
				</span>
				{isPaginationPending ? (
					<span
						aria-hidden="true"
						className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground"
					/>
				) : null}
			</div>

			<div className="flex items-center gap-4">
				<div className="flex items-center gap-2">
					<span data-slot="rows-per-page-label">{t('rows-per-page')}</span>
					<span
						className="publy-page-size-select"
						data-testid={`${testId}-page-size`}
					>
						<Select
							value={String(size)}
							onValueChange={(nextValue) => {
								if (typeof nextValue === 'string') {
									onSizeChange(Number(nextValue));
								}
							}}
							disabled={paginationDisabled}
						>
							<SelectTrigger
								aria-label={t('rows-per-page')}
								className="h-7 gap-1 rounded-[10px] bg-background px-2 text-xs shadow-none"
								data-testid={`${testId}-page-size-trigger`}
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{PAGE_SIZE_OPTIONS.map((option) => (
									<SelectItem key={String(option)} value={String(option)}>
										{option}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</span>
				</div>

				<div className="flex items-center gap-1">
					<span title={disabled ? disabledTitle : undefined}>
						<button
							className="publy-pager-button"
							type="button"
							aria-label={t('previous-page')}
							disabled={paginationDisabled || !hasPreviousPage}
							onClick={onPreviousPage}
							data-testid={`${testId}-prev-page`}
						>
							<IconChevronLeft className="size-4" />
						</button>
					</span>
					<span className="publy-pager-current">{pageIndex + 1}</span>
					<span title={disabled ? disabledTitle : undefined}>
						<button
							className="publy-pager-button"
							type="button"
							aria-label={t('next-page')}
							disabled={paginationDisabled || !hasNextPage}
							onClick={onNextPage}
							data-testid={`${testId}-next-page`}
						>
							<IconChevronRight className="size-4" />
						</button>
					</span>
				</div>
			</div>
		</div>
	);
};

export type DataTableProps<TData extends { id: string }> = {
	testId: string;
	ariaLabel: string;
	columns: ColumnDef<TData>[];
	rows: TData[];
	/** Loading / error / active-search flags that select the table body
	 * state (loading, error, empty, no-match, rows). Grouped as one object so
	 * the component stays under the `no-many-boolean-props` cap without a
	 * suppression (#1291 rung 1). */
	queryState: DataTableQueryState;
	/** Cursor-pager state and callbacks, rendered inside the table card.
	 * Grouped for the same reason as `queryState`. */
	pagination: DataTablePaginationState;
	errorContent?: ReactNode;
	emptyContent?: ReactNode;
	noMatchContent?: ReactNode;
	/** Icon overriding the default `IconAlertCircle` for the error state. */
	errorIcon?: TablerIcon;
	/** Title overriding the default "list unavailable" copy for the error state. */
	errorTitle?: string;
	/** Icon overriding the default `IconInbox` for the empty state. */
	emptyIcon?: TablerIcon;
	/** Title overriding the default "nothing here" copy for the empty state. */
	emptyTitle?: string;
	/** Extra actions rendered alongside the empty state (e.g. an invite CTA). */
	emptyActions?: ReactNode;
	/** Icon overriding the default `IconSearchOff` for the no-match state. */
	noMatchIcon?: TablerIcon;
	/** Title overriding the default "no matches" copy for the no-match state. */
	noMatchTitle?: string;
	sort: SortState;
	onSortChange: (nextSort: SortState | undefined) => void;
	size: number;
	onSizeChange: (nextSize: number) => void;
	searchDraft?: string;
	onSearchDraftChange?: (value: string) => void;
	density?: TableDensity;
	rowHeight?: TableRowHeight;
	selection?: UseRowSelectionResult;
	/** Right-aligned toolbar controls (filters, view toggles). */
	toolbarEnd?: ReactNode;
	searchPlaceholder?: string;
	/** Row selection checkbox aria-label source — defaults to `row.id` (a raw
	 * UUID, announced as-is). Pass the row's display name/email/etc. so a
	 * screen-reader user hears "Select Acme Corporation", not "Select
	 * 0195f6a7-3c2e-…". */
	getRowLabel?: (row: TData) => string;
};

type DataTableQueryState = {
	/** Query is loading its first page. */
	isPending: boolean;
	/** Query failed; renders the error body state. */
	isError: boolean;
	/** Retry callback surfaced by the error body state. */
	onRetry: () => void;
	/** A committed search filter is active; empty rows render "no matches"
	 * instead of "nothing here". */
	hasActiveSearch: boolean;
};

type DataTablePaginationState = {
	pageIndex: number;
	hasPreviousPage: boolean;
	hasNextPage: boolean;
	/** A follow-up page is in flight; pager controls show busy state. */
	isPaginationPending: boolean;
	onNextPage: () => void;
	onPreviousPage: () => void;
};

// Grouped state objects keep the public prop list clear of six scattered
// booleans (`no-many-boolean-props`) — see `DataTableQueryState` and
// `DataTablePaginationState` above (#1291 rung 1).
export const DataTable = <TData extends { id: string }>({
	testId,
	ariaLabel,
	columns,
	rows,
	queryState: { isPending, isError, onRetry, hasActiveSearch },
	pagination: {
		pageIndex,
		hasPreviousPage,
		hasNextPage,
		isPaginationPending,
		onNextPage,
		onPreviousPage,
	},
	errorContent,
	emptyContent,
	noMatchContent,
	errorIcon,
	errorTitle,
	emptyIcon,
	emptyTitle,
	emptyActions,
	noMatchIcon,
	noMatchTitle,
	sort,
	onSortChange,
	size,
	onSizeChange,
	searchDraft,
	onSearchDraftChange,
	selection,
	toolbarEnd,
	searchPlaceholder,
	rowHeight,
	density,
	getRowLabel = (row) => row.id,
}: DataTableProps<TData>) => {
	// "use no memo" — the table instance from `useReactTable` is MUTABLE and
	// identity-stable across renders; its row model updates in place when the
	// `data` option changes. The React Compiler (on in production builds,
	// vite.config.ts) caches this component's JSX children, so after a search
	// clear or pagination move only DataTable itself re-rendered while its
	// extracted children kept showing the PREVIOUS page's rows. The CI e2e
	// failures on 2026-08-24 across five specs (search-clear restore, status-
	// filter reset, level-filter disabled state, pager Previous) were one
	// root cause. Opting these three components out restores pre-split
	// semantics: children re-render whenever the parent does. Keep any
	// component that reads `table.*` during render out of the compiler.
	'use no memo';
	const { t } = useTranslation('common');
	const isSelectionMode = selection?.isSelectionMode ?? false;
	const displayBreakpoints = useMemo(
		() => collectDisplayBreakpoints(columns),
		[columns],
	);
	const matchedBreakpoints = useMatchedBreakpoints(displayBreakpoints);
	const [focusedCell, setFocusedCell] = useState({ row: 0, cell: 0 });
	const columnVisibility = useMemo<VisibilityState>(() => {
		const visibility: VisibilityState = {};
		for (const column of columns) {
			const hideBelow = columnDisplayMeta(column).hideBelow;
			if (hideBelow != null && column.id != null) {
				visibility[column.id] = matchedBreakpoints.has(hideBelow);
			}
		}
		return visibility;
	}, [columns, matchedBreakpoints]);
	const resolvedRowHeight = useMemo<TableRowHeight>(() => {
		if (rowHeight != null) {
			return rowHeight;
		}

		if (density != null) {
			return DENSITY_TO_ROW_HEIGHT[density];
		}

		return TABLE_DEFAULT_ROW_HEIGHT;
	}, [rowHeight, density]);

	const table = useReactTable({
		data: rows,
		columns,
		state: { sorting: toSortingState(sort), columnVisibility },
		manualSorting: true,
		getCoreRowModel: getCoreRowModel(),
		getRowId: (row) => row.id,
	});

	const bodyState = resolveTableBodyState({
		isPending,
		isError,
		rowCount: rows.length,
		hasActiveSearch,
	});

	return (
		<div className="publy-data-table-shell" data-testid={testId}>
			<DataTableToolbar
				testId={testId}
				searchDraft={searchDraft}
				onSearchDraftChange={onSearchDraftChange}
				searchPlaceholder={searchPlaceholder}
				disabled={isSelectionMode}
				disabledTitle={t(SELECTION_LOCKED_TITLE_KEY)}
				toolbarEnd={toolbarEnd}
			/>

			<DataTableStates
				testId={testId}
				bodyState={bodyState}
				resolvedRowHeight={resolvedRowHeight}
				onRetry={onRetry}
				errorContent={errorContent}
				emptyContent={emptyContent}
				noMatchContent={noMatchContent}
				errorIcon={errorIcon}
				errorTitle={errorTitle}
				emptyIcon={emptyIcon}
				emptyTitle={emptyTitle}
				emptyActions={emptyActions}
				noMatchIcon={noMatchIcon}
				noMatchTitle={noMatchTitle}
			/>

			{bodyState === 'rows' ? (
				<div
					className="publy-table-card"
					data-row-height={resolvedRowHeight}
					data-slot="table-card"
					data-testid={`${testId}-card`}
				>
					<DataTableGrid
						testId={testId}
						ariaLabel={ariaLabel}
						table={table}
						matchedBreakpoints={matchedBreakpoints}
						resolvedRowHeight={resolvedRowHeight}
						isSelectionMode={isSelectionMode}
						onSortChange={onSortChange}
						selection={selection}
						getRowLabel={getRowLabel}
						focusedCell={focusedCell}
						onFocusedCellChange={setFocusedCell}
					/>

					<DataTableCursorFooter
						testId={testId}
						pageIndex={pageIndex}
						size={size}
						onSizeChange={onSizeChange}
						hasPreviousPage={hasPreviousPage}
						hasNextPage={hasNextPage}
						isPaginationPending={isPaginationPending}
						onNextPage={onNextPage}
						onPreviousPage={onPreviousPage}
						disabled={isSelectionMode}
						disabledTitle={t(SELECTION_LOCKED_TITLE_KEY)}
					/>
				</div>
			) : null}
		</div>
	);
};
