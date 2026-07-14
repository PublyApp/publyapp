import {
	IconArrowDown,
	IconArrowUp,
	IconArrowsSort,
	IconChevronLeft,
	IconChevronRight,
	IconSearch,
	type TablerIcon,
} from '@tabler/icons-react';
import {
	type ColumnDef,
	type VisibilityState,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from '@tanstack/react-table';
import {
	useMemo,
	useState,
	useSyncExternalStore,
	type KeyboardEvent,
	type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select';
import { Skeleton } from '~/components/ui/skeleton';
import {
	ErrorStateSurface,
	NoMatchStateSurface,
	StateSurface,
} from '~/components/ui/state-surface';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '~/components/ui/table';
import { PAGE_SIZE_OPTIONS } from '~/lib/url-state/table-search-params';

import { toSortingState } from './sort-descriptor';
import type { SortState } from './sort-descriptor';
import { resolveTableBodyState } from './table-body-state';
import type { UseRowSelectionResult } from './use-row-selection';

const SKELETON_ROW_KEYS = [
	'sk-1',
	'sk-2',
	'sk-3',
	'sk-4',
	'sk-5',
	'sk-6',
	'sk-7',
] as const;

export type TableDensity = 'compact' | 'comfortable';
export type TableRowHeight = 48 | 52 | 56;

const DENSITY_TO_ROW_HEIGHT: Record<TableDensity, TableRowHeight> = {
	compact: 48,
	comfortable: 56,
};

const TABLE_DEFAULT_ROW_HEIGHT: TableRowHeight = 48;

/**
 * Shared i18n key for the "disabled while rows are selected" tooltip title —
 * export it so route-level tables don't hand-roll their own duplicate
 * literal (see tenants/$tenantId/profiles.tsx's now-removed local copy).
 */
export const SELECTION_LOCKED_TITLE_KEY = 'selection-locked-while-selecting';

/** Optional per-column display hints read from TanStack's ColumnDef meta. */
type ColumnDisplayMeta = {
	/** 14px leading icon rendered before the header label. */
	headerIcon?: ReactNode;
	/** Extra class applied to both the header and body cells (e.g. width). */
	cellClassName?: string;
	/**
	 * Fixed `<col>` width (e.g. '104px'). Omit for the one column per table
	 * that should absorb remaining space — table-layout:fixed gives an
	 * unspecified column the leftover width, the fluid-column equivalent of
	 * `1fr`.
	 */
	width?: string;
	/**
	 * Centres cell content against the full column box instead of the
	 * padded content box (e.g. a 40px actions column with a 32px trigger,
	 * where the default 14px inline padding leaves no room to centre).
	 */
	align?: 'center';
	/**
	 * Drops the column entirely (not just visually — via TanStack column
	 * visibility, so its `<col>` and cells never render) once the viewport
	 * narrows below this px width, e.g. `768`. table-layout:fixed sizes the
	 * table from the sum of its *visible* fixed-width columns, so removing a
	 * column from that sum is what keeps the table from forcing horizontal
	 * scroll on narrow screens — a CSS-only `display:none` on a `<col>`
	 * wouldn't shrink that sum, `<col>` display is largely inert.
	 */
	hideBelow?: number;
	/**
	 * Restricts `width` to viewports at or above this px breakpoint; below
	 * it, the column drops its explicit width and flexes like an unset
	 * (`1fr`-equivalent) column instead. For an identity column that must
	 * stay pinned at its ratified desktop grid width (e.g. `200px`) but
	 * can't afford that same fixed width once the other columns it shares a
	 * row with have already dropped to their `hideBelow` floor — pinning it
	 * unconditionally would blow the mobile `rows.scrollWidth <=
	 * card.clientWidth` budget table-layout:fixed enforces.
	 */
	pinWidthAbove?: number;
};

declare module '@tanstack/react-table' {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	interface ColumnMeta<TData, TValue> extends ColumnDisplayMeta {}
}

const columnDisplayMeta = (
	column: ColumnDef<never> | { meta?: unknown },
): ColumnDisplayMeta => (column.meta ?? {}) as ColumnDisplayMeta;

/** Resolves a column's effective `<col>` width, honoring `pinWidthAbove`. */
const resolveColumnWidth = (
	displayMeta: ColumnDisplayMeta,
	viewportWidth: number,
): string | undefined => {
	if (displayMeta.width == null) {
		return undefined;
	}
	if (
		displayMeta.pinWidthAbove != null &&
		viewportWidth < displayMeta.pinWidthAbove
	) {
		return undefined;
	}
	return displayMeta.width;
};

const subscribeToViewportWidth = (callback: () => void): (() => void) => {
	window.addEventListener('resize', callback);
	return () => window.removeEventListener('resize', callback);
};

const getViewportWidthSnapshot = (): number => window.innerWidth;

/**
 * SSR/first-paint snapshot is `Infinity` so every `hideBelow` column renders
 * on the server and during hydration (desktop-first, same convention as
 * `useMediaQuery`'s `true` server snapshot) — `useSyncExternalStore`
 * reconciles to the real width right after mount.
 */
const getViewportWidthServerSnapshot = (): number => Number.POSITIVE_INFINITY;

/** Drives per-column `hideBelow` breakpoints off the live viewport width. */
const useViewportWidth = (): number =>
	useSyncExternalStore(
		subscribeToViewportWidth,
		getViewportWidthSnapshot,
		getViewportWidthServerSnapshot,
	);

const resolveAriaSortState = (
	tableSort: { id: string; desc: boolean } | undefined,
	columnId: string,
): 'ascending' | 'descending' | 'none' => {
	if (tableSort?.id !== columnId) {
		return 'none';
	}

	return tableSort.desc ? 'descending' : 'ascending';
};

export type DataTableToolbarProps = {
	testId: string;
	searchDraft: string;
	onSearchDraftChange: (value: string) => void;
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
			<div className="publy-search-wrapper">
				<IconSearch aria-hidden="true" className="publy-search-icon" />
				<Input
					aria-label={t('search')}
					className="publy-data-table-search-input bg-background pl-9"
					value={searchDraft}
					onChange={(event) => onSearchDraftChange(event.target.value)}
					disabled={disabled}
					title={disabled ? disabledTitle : undefined}
					placeholder={resolvedPlaceholder}
					data-testid={`${testId}-search`}
				/>
			</div>
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
	isPending: boolean;
	isError: boolean;
	onRetry: () => void;
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
	hasActiveSearch: boolean;
	sort: SortState;
	onSortChange: (nextSort: SortState | undefined) => void;
	size: number;
	onSizeChange: (nextSize: number) => void;
	pageIndex: number;
	hasPreviousPage: boolean;
	hasNextPage: boolean;
	isPaginationPending: boolean;
	onNextPage: () => void;
	onPreviousPage: () => void;
	searchDraft: string;
	onSearchDraftChange: (value: string) => void;
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

export const DataTable = <TData extends { id: string }>({
	testId,
	ariaLabel,
	columns,
	rows,
	isPending,
	isError,
	onRetry,
	errorContent,
	emptyContent,
	noMatchContent,
	errorIcon,
	errorTitle,
	emptyIcon,
	emptyTitle,
	emptyActions: emptyActionsProp,
	noMatchIcon,
	noMatchTitle,
	hasActiveSearch,
	sort,
	onSortChange,
	size,
	onSizeChange,
	pageIndex,
	hasPreviousPage,
	hasNextPage,
	isPaginationPending,
	onNextPage,
	onPreviousPage,
	searchDraft,
	onSearchDraftChange,
	selection,
	toolbarEnd,
	searchPlaceholder,
	rowHeight,
	density,
	getRowLabel = (row) => row.id,
}: DataTableProps<TData>) => {
	const { t } = useTranslation('common');
	const isSelectionMode = selection?.isSelectionMode ?? false;
	const hasSelection = selection != null;
	const viewportWidth = useViewportWidth();
	const [focusedCell, setFocusedCell] = useState({ row: 0, cell: 0 });
	const columnVisibility = useMemo<VisibilityState>(() => {
		const visibility: VisibilityState = {};
		for (const column of columns) {
			const hideBelow = columnDisplayMeta(column).hideBelow;
			if (hideBelow != null && column.id != null) {
				visibility[column.id] = viewportWidth >= hideBelow;
			}
		}
		return visibility;
	}, [columns, viewportWidth]);
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

	const hasFixedColumns = table
		.getVisibleLeafColumns()
		.some((column) => columnDisplayMeta(column.columnDef).width != null);

	const tableSort = table.getState().sorting.at(0);
	const rowModels = table.getRowModel().rows;
	const visibleRowIds = rowModels.map((row) => row.id);
	const selectedRowIds = selection?.rowSelection ?? {};
	const selectedVisibleRowIds = visibleRowIds.filter(
		(rowId) => selectedRowIds[rowId],
	);
	const allRowsSelected =
		visibleRowIds.length > 0 &&
		selectedVisibleRowIds.length === visibleRowIds.length;
	const hasPartialSelection =
		selectedVisibleRowIds.length > 0 &&
		selectedVisibleRowIds.length < visibleRowIds.length;

	// Roving tabindex (shell F3): only one body cell is ever a tab stop, so a
	// keyboard user reaches the pager in one Tab press instead of rowCount ×
	// colCount. Arrow-key navigation (handleCellNavigation below) moves focus
	// programmatically, which fires onFocus and rolls the tab stop with it.
	// Clamped defensively against the current row/column counts so a stale
	// position (e.g. after a filter shrinks the row count) never lands on a
	// cell that no longer exists, which would leave the whole table
	// unreachable by Tab.
	const totalCellsPerRow =
		table.getVisibleLeafColumns().length + (hasSelection ? 1 : 0);
	const safeFocusedRow =
		rowModels.length === 0
			? 0
			: Math.min(focusedCell.row, rowModels.length - 1);
	const safeFocusedCellIndex =
		totalCellsPerRow === 0
			? 0
			: Math.min(focusedCell.cell, totalCellsPerRow - 1);

	const bodyState = resolveTableBodyState({
		isPending,
		isError,
		rowCount: rows.length,
		hasActiveSearch,
	});

	let errorDescription: string | undefined;
	if (typeof errorContent === 'string') {
		errorDescription = errorContent;
	} else if (!errorContent) {
		errorDescription = t('list-error-default-description');
	}
	const errorActions =
		typeof errorContent !== 'string' && errorContent ? errorContent : undefined;

	const emptyDescription =
		typeof emptyContent === 'string'
			? emptyContent
			: t('list-empty-default-description');
	const emptyActions =
		emptyActionsProp ??
		(typeof emptyContent !== 'string' && emptyContent
			? emptyContent
			: undefined);

	const noMatchDescription =
		typeof noMatchContent === 'string'
			? noMatchContent
			: t('list-no-match-default-description');
	const noMatchActions =
		typeof noMatchContent !== 'string' && noMatchContent
			? noMatchContent
			: undefined;

	const handleSort = (columnId: string): void => {
		if (isSelectionMode) {
			return;
		}

		if (tableSort?.id !== columnId) {
			onSortChange({ id: columnId, order: 'asc' });
			return;
		}

		onSortChange({
			id: columnId,
			order: tableSort.desc ? 'asc' : 'desc',
		});
	};

	const handleSortKeyDown = (
		event: KeyboardEvent<HTMLTableCellElement>,
		columnId: string,
	): void => {
		if (event.key !== 'Enter' && event.key !== ' ') {
			return;
		}

		event.preventDefault();
		handleSort(columnId);
	};

	const handleToggleSelectAll = (): void => {
		if (!selection) {
			return;
		}

		selection.onSelectionChange(
			allRowsSelected || visibleRowIds.length === 0
				? new Set()
				: new Set(visibleRowIds),
		);
	};

	const handleToggleRowSelection = (rowId: string): void => {
		if (!selection) {
			return;
		}

		const nextSelection = new Set(selectedVisibleRowIds);
		if (selectedRowIds[rowId]) {
			nextSelection.delete(rowId);
		} else {
			nextSelection.add(rowId);
		}

		selection.onSelectionChange(nextSelection);
	};

	const handleCellNavigation = (
		event: KeyboardEvent<HTMLTableCellElement>,
		currentRowIndex: number,
		currentCellIndex: number,
	): void => {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
			return;
		}

		const rowDelta = event.key === 'ArrowDown' ? 1 : -1;
		const nextRowIndex = currentRowIndex + rowDelta;
		if (nextRowIndex < 0 || nextRowIndex >= rowModels.length) {
			return;
		}

		const tableBody = event.currentTarget.closest('tbody');
		const nextCell = tableBody?.querySelector<HTMLTableCellElement>(
			`tr[data-row-index="${nextRowIndex}"] td[data-cell-index="${currentCellIndex}"]`,
		);
		if (nextCell) {
			event.preventDefault();
			nextCell.focus();
		}
	};

	const renderSortIcon = (columnId: string): ReactNode => {
		if (tableSort?.id !== columnId) {
			return <IconArrowsSort data-slot="table-sort-icon" />;
		}

		return tableSort.desc ? (
			<IconArrowDown data-slot="table-sort-icon" />
		) : (
			<IconArrowUp data-slot="table-sort-icon" />
		);
	};

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

			{bodyState === 'loading' ? (
				<div
					className="publy-table-card"
					data-row-height={resolvedRowHeight}
					data-slot="table-card"
					data-testid={`${testId}-loading`}
				>
					<div className="publy-table-skeleton-header" />
					{SKELETON_ROW_KEYS.map((rowKey) => (
						<div key={rowKey} className="publy-table-skeleton-row">
							<Skeleton className="size-[26px] shrink-0 rounded-full" />
							<Skeleton className="h-3 w-40 rounded-full" />
							<Skeleton className="h-3 w-56 rounded-full" />
							<Skeleton className="ml-auto h-5 w-16 rounded-full" />
							<Skeleton className="h-5 w-16 rounded-full" />
						</div>
					))}
				</div>
			) : null}

			{bodyState === 'error' ? (
				<ErrorStateSurface
					icon={errorIcon}
					title={errorTitle ?? t('list-unavailable-title')}
					description={errorDescription}
					actions={
						<>
							{errorActions}
							<Button variant="outline" onClick={onRetry} type="button">
								{t('retry')}
							</Button>
						</>
					}
					testId={`${testId}-error`}
				/>
			) : null}

			{bodyState === 'empty' ? (
				<StateSurface
					icon={emptyIcon}
					title={emptyTitle ?? t('list-empty-title')}
					description={emptyDescription}
					actions={emptyActions}
					testId={`${testId}-empty`}
				/>
			) : null}

			{bodyState === 'no-match' ? (
				<NoMatchStateSurface
					icon={noMatchIcon}
					title={noMatchTitle ?? t('list-no-match-title')}
					description={noMatchDescription}
					actions={noMatchActions}
					testId={`${testId}-no-match`}
				/>
			) : null}

			{bodyState === 'rows' ? (
				<div
					className="publy-table-card"
					data-row-height={resolvedRowHeight}
					data-slot="table-card"
					data-testid={`${testId}-card`}
				>
					<Table
						aria-label={ariaLabel}
						role="grid"
						className="publy-data-table"
						data-testid={`${testId}-rows`}
						data-slot="table"
						data-row-height={resolvedRowHeight}
						data-fixed-columns={hasFixedColumns ? '' : undefined}
					>
						<colgroup>
							{hasSelection ? <col style={{ width: '40px' }} /> : null}
							{table.getVisibleLeafColumns().map((column) => {
								const displayMeta = columnDisplayMeta(column.columnDef);
								const width = resolveColumnWidth(displayMeta, viewportWidth);
								return (
									<col key={column.id} style={width ? { width } : undefined} />
								);
							})}
						</colgroup>
						<TableHeader>
							<TableRow>
								{hasSelection ? (
									<TableHead
										data-slot="table-selection-cell"
										aria-label={t('row-selection-column')}
									>
										<Checkbox
											checked={allRowsSelected}
											indeterminate={hasPartialSelection}
											onCheckedChange={() => {
												handleToggleSelectAll();
											}}
											aria-label={t('select-all-rows')}
										/>
									</TableHead>
								) : null}
								{table.getHeaderGroups().flatMap((headerGroup) =>
									headerGroup.headers.map((header) => {
										const canSort = header.column.getCanSort();
										const displayMeta = columnDisplayMeta(
											header.column.columnDef,
										);
										const sortIcon = canSort ? renderSortIcon(header.id) : null;
										const sortState = canSort
											? resolveAriaSortState(tableSort, header.id)
											: undefined;
										return (
											<TableHead
												key={header.id}
												data-slot={
													canSort
														? 'table-sortable-column-header'
														: 'table-column'
												}
												data-align={displayMeta.align}
												onClick={() => {
													if (canSort) {
														handleSort(header.id);
													}
												}}
												onKeyDown={(event) => {
													if (canSort) {
														handleSortKeyDown(event, header.id);
													}
												}}
												tabIndex={canSort ? 0 : undefined}
												aria-sort={sortState}
												className={`${canSort ? 'cursor-pointer' : ''} ${
													displayMeta.cellClassName ?? ''
												}`}
											>
												<div className="inline-flex items-center gap-1.5">
													{displayMeta.headerIcon ? (
														<span
															aria-hidden="true"
															data-slot="table-header-icon"
															className="inline-flex items-center [&_svg]:size-3.5"
														>
															{displayMeta.headerIcon}
														</span>
													) : null}
													{flexRender(
														header.column.columnDef.header,
														header.getContext(),
													)}
													{sortIcon}
												</div>
											</TableHead>
										);
									}),
								)}
							</TableRow>
						</TableHeader>
						<TableBody>
							{rowModels.map((row, rowIndex) => {
								const visibleCells = row.getVisibleCells();
								const isRowSelected = Boolean(selectedRowIds[row.id]);
								return (
									<TableRow
										key={row.id}
										data-row-index={rowIndex}
										data-slot="table-row"
										data-state={isRowSelected ? 'selected' : undefined}
									>
										{hasSelection ? (
											<TableCell
												data-cell-index={0}
												data-slot="table-selection-cell"
												role="gridcell"
												tabIndex={
													rowIndex === safeFocusedRow &&
													safeFocusedCellIndex === 0
														? 0
														: -1
												}
												onFocus={() => {
													setFocusedCell({ row: rowIndex, cell: 0 });
												}}
												onKeyDown={(event) => {
													handleCellNavigation(event, rowIndex, 0);
												}}
											>
												<Checkbox
													checked={isRowSelected}
													onCheckedChange={() => {
														handleToggleRowSelection(row.id);
													}}
													aria-label={t('select-row-named', {
														name: getRowLabel(row.original),
													})}
												/>
											</TableCell>
										) : null}
										{visibleCells.map((cell, cellIndex) => {
											const renderedCellIndex = hasSelection
												? cellIndex + 1
												: cellIndex;
											const displayMeta = columnDisplayMeta(
												cell.column.columnDef,
											);
											return (
												<TableCell
													key={cell.id}
													data-cell-index={renderedCellIndex}
													data-slot="table-cell"
													data-align={displayMeta.align}
													className={displayMeta.cellClassName}
													role="gridcell"
													tabIndex={
														rowIndex === safeFocusedRow &&
														safeFocusedCellIndex === renderedCellIndex
															? 0
															: -1
													}
													onFocus={() => {
														setFocusedCell({
															row: rowIndex,
															cell: renderedCellIndex,
														});
													}}
													onKeyDown={(event) => {
														handleCellNavigation(
															event,
															rowIndex,
															renderedCellIndex,
														);
													}}
												>
													{flexRender(
														cell.column.columnDef.cell,
														cell.getContext(),
													)}
												</TableCell>
											);
										})}
									</TableRow>
								);
							})}
						</TableBody>
					</Table>

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
