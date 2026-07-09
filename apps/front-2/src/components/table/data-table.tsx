import {
	IconArrowsSort,
	IconChevronLeft,
	IconChevronRight,
	IconSearch,
	IconSortAscending,
	IconSortDescending,
} from '@tabler/icons-react';
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from '@tanstack/react-table';
import type { KeyboardEvent, ReactNode } from 'react';
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

import { toSortingState } from './sort-descriptor';
import type { SortState } from './sort-descriptor';
import { resolveTableBodyState } from './table-body-state';
import type { UseRowSelectionResult } from './use-row-selection';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

const SORTING_ICON_CLASS = 'size-4 shrink-0 text-muted-foreground';

export type TableDensity = 'compact' | 'comfortable';

const DENSITY_CELL_CLASS: Record<TableDensity, string> = {
	compact: 'py-1.5',
	comfortable: 'py-3',
};

const SELECTION_LOCKED_TITLE = 'Unavailable while rows are selected';

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
	selection?: UseRowSelectionResult;
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
	density = 'compact',
	selection,
}: DataTableProps<TData>) => {
	const isSelectionMode = selection?.isSelectionMode ?? false;
	const cellPaddingClass = DENSITY_CELL_CLASS[density];
	const hasSelection = selection != null;

	const table = useReactTable({
		data: rows,
		columns,
		state: { sorting: toSortingState(sort) },
		manualSorting: true,
		getCoreRowModel: getCoreRowModel(),
		getRowId: (row) => row.id,
	});

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

	const bodyState = resolveTableBodyState({
		isPending,
		isError,
		rowCount: rows.length,
		hasActiveSearch,
	});

	const paginationDisabled = isSelectionMode || isPaginationPending;

	const errorDescription =
		typeof errorContent === 'string'
			? errorContent
			: errorContent
				? undefined
				: 'There was a problem loading this list.';
	const errorActions =
		typeof errorContent !== 'string' && errorContent ? errorContent : undefined;

	const emptyDescription =
		typeof emptyContent === 'string'
			? emptyContent
			: 'No records yet. Create one to get started.';
	const emptyActions =
		typeof emptyContent !== 'string' && emptyContent ? emptyContent : undefined;

	const noMatchDescription =
		typeof noMatchContent === 'string'
			? noMatchContent
			: 'No results match your search.';
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
			return <IconArrowsSort className={SORTING_ICON_CLASS} />;
		}

		return tableSort.desc ? (
			<IconSortDescending className={SORTING_ICON_CLASS} />
		) : (
			<IconSortAscending className={SORTING_ICON_CLASS} />
		);
	};

	return (
		<div className="publy-data-table-shell" data-testid={testId}>
			<div
				className="publy-data-table-toolbar"
				data-testid={`${testId}-toolbar`}
			>
				<div className="publy-search-wrapper">
					<IconSearch aria-hidden="true" className="publy-search-icon" />
					<Input
						aria-label="Search"
						value={searchDraft}
						onChange={(event) => onSearchDraftChange(event.target.value)}
						disabled={isSelectionMode}
						title={isSelectionMode ? SELECTION_LOCKED_TITLE : undefined}
						placeholder="Search"
						data-testid={`${testId}-search`}
					/>
				</div>
			</div>

			{bodyState === 'loading' ? (
				<div className="space-y-2" data-testid={`${testId}-loading`}>
					<Skeleton className="h-10 w-full rounded-md" />
					<Skeleton className="h-10 w-full rounded-md" />
					<Skeleton className="h-10 w-full rounded-md" />
				</div>
			) : null}

			{bodyState === 'error' ? (
				<ErrorStateSurface
					title="List unavailable"
					description={errorDescription}
					actions={
						<>
							{errorActions}
							<Button variant="secondary" onClick={onRetry} type="button">
								Retry
							</Button>
						</>
					}
					testId={`${testId}-error`}
				/>
			) : null}

			{bodyState === 'empty' ? (
				<StateSurface
					title="No records yet"
					description={emptyDescription}
					actions={emptyActions}
					testId={`${testId}-empty`}
				/>
			) : null}

			{bodyState === 'no-match' ? (
				<NoMatchStateSurface
					title="No matches"
					description={noMatchDescription}
					actions={noMatchActions}
					testId={`${testId}-no-match`}
				/>
			) : null}

			{bodyState === 'rows' ? (
				<Table
					aria-label={ariaLabel}
					className="publy-data-table"
					data-testid={`${testId}-rows`}
					data-slot="table"
				>
					<TableHeader>
						<TableRow>
							{hasSelection ? (
								<TableHead
									className={`${cellPaddingClass} publy-type-table-header`}
									data-slot="table-column"
								>
									<Checkbox
										checked={allRowsSelected}
										indeterminate={hasPartialSelection}
										onCheckedChange={() => {
											handleToggleSelectAll();
										}}
										aria-label="Select all rows"
									/>
								</TableHead>
							) : null}
							{table.getHeaderGroups().flatMap((headerGroup) =>
								headerGroup.headers.map((header) => {
									const canSort = header.column.getCanSort();
									const sortIcon = canSort ? renderSortIcon(header.id) : null;
									const sortState = canSort
										? tableSort?.id === header.id
											? tableSort.desc
												? 'descending'
												: 'ascending'
											: 'none'
										: undefined;
									return (
										<TableHead
											key={header.id}
											data-slot={
												canSort
													? 'table-sortable-column-header'
													: 'table-column'
											}
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
											className={`${cellPaddingClass} publy-type-table-header ${
												canSort ? 'cursor-pointer' : ''
											}`}
										>
											<div className="inline-flex items-center gap-1.5">
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
							return (
								<TableRow
									key={row.id}
									data-row-index={rowIndex}
									data-slot="table-row"
								>
									{hasSelection ? (
										<TableCell
											data-cell-index={0}
											data-slot="table-cell"
											className={`${cellPaddingClass} publy-type-table-cell`}
										>
											<Checkbox
												checked={Boolean(selectedRowIds[row.id])}
												onCheckedChange={() => {
													handleToggleRowSelection(row.id);
												}}
												aria-label={`Select row ${row.id}`}
											/>
										</TableCell>
									) : null}
									{visibleCells.map((cell, cellIndex) => {
										const renderedCellIndex = hasSelection
											? cellIndex + 1
											: cellIndex;
										return (
											<TableCell
												key={cell.id}
												data-cell-index={renderedCellIndex}
												data-slot="table-cell"
												className={`${cellPaddingClass} publy-type-table-cell`}
												tabIndex={0}
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
			) : null}

			<div className="publy-data-table-footer" data-testid={`${testId}-footer`}>
				<div className="flex items-center gap-2">
					<span className="text-sm text-foreground-500">Rows per page</span>
					<span data-testid={`${testId}-page-size`}>
						<Select
							aria-label="Rows per page"
							value={String(size)}
							onValueChange={(nextValue) => {
								if (typeof nextValue === 'string') {
									onSizeChange(Number(nextValue));
								}
							}}
							disabled={paginationDisabled}
						>
							<SelectTrigger data-testid={`${testId}-page-size-trigger`}>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{PAGE_SIZE_OPTIONS.map((option) => (
									<SelectItem key={String(option)} value={String(option)}>
										{option} rows
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</span>
				</div>

				<div className="flex items-center gap-2">
					<span data-slot="page-label" data-testid={`${testId}-page-label`}>
						Page {pageIndex + 1}
					</span>
					{isPaginationPending ? (
						<span
							aria-hidden="true"
							className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground"
						/>
					) : null}
					<span title={isSelectionMode ? SELECTION_LOCKED_TITLE : undefined}>
						<Button
							variant="secondary"
							type="button"
							disabled={paginationDisabled || !hasPreviousPage}
							onClick={onPreviousPage}
							data-testid={`${testId}-prev-page`}
						>
							<IconChevronLeft className="size-4" />
							Previous
						</Button>
					</span>
					<span title={isSelectionMode ? SELECTION_LOCKED_TITLE : undefined}>
						<Button
							variant="secondary"
							type="button"
							disabled={paginationDisabled || !hasNextPage}
							onClick={onNextPage}
							data-testid={`${testId}-next-page`}
						>
							Next
							<IconChevronRight className="size-4" />
						</Button>
					</span>
				</div>
			</div>
		</div>
	);
};
