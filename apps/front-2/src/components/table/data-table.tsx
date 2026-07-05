import { Button, Input, Skeleton, Spinner, Table } from '@heroui/react';
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from '@tanstack/react-table';
import type { ReactNode } from 'react';

import {
	fromTableSortDescriptor,
	toSortingState,
	toTableSortDescriptor,
} from './sort-descriptor';
import type { SortState } from './sort-descriptor';
import { resolveTableBodyState } from './table-body-state';
import type { UseRowSelectionResult } from './use-row-selection';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

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

	const table = useReactTable({
		data: rows,
		columns,
		state: { sorting: toSortingState(sort) },
		manualSorting: true,
		getCoreRowModel: getCoreRowModel(),
		getRowId: (row) => row.id,
	});

	const sortDescriptor = toTableSortDescriptor(toSortingState(sort));
	const bodyState = resolveTableBodyState({
		isPending,
		isError,
		rowCount: rows.length,
		hasActiveSearch,
	});
	const rowHeaderColumnId = table.getAllLeafColumns()[0]?.id;

	const paginationDisabled = isSelectionMode || isPaginationPending;
	const tableSelectionProps = selection
		? {
				selectionMode: 'multiple' as const,
				selectedKeys: selection.selectedKeys,
				onSelectionChange: selection.onSelectionChange,
			}
		: {};

	return (
		<div className="space-y-3" data-testid={testId}>
			<Input
				aria-label="Search"
				value={searchDraft}
				onChange={(event) => onSearchDraftChange(event.target.value)}
				disabled={isSelectionMode}
				title={isSelectionMode ? SELECTION_LOCKED_TITLE : undefined}
				placeholder="Search"
				data-testid={`${testId}-search`}
			/>

			{bodyState === 'loading' ? (
				<div className="space-y-2" data-testid={`${testId}-loading`}>
					<Skeleton className="h-10 w-full rounded-md" />
					<Skeleton className="h-10 w-full rounded-md" />
					<Skeleton className="h-10 w-full rounded-md" />
				</div>
			) : null}

			{bodyState === 'error' ? (
				<div
					className="flex flex-col items-center gap-3 rounded-md border border-border p-8 text-center"
					data-testid={`${testId}-error`}
				>
					{errorContent ?? (
						<p className="text-sm text-muted">
							Something went wrong loading this list.
						</p>
					)}
					<Button variant="secondary" onPress={onRetry} type="button">
						Retry
					</Button>
				</div>
			) : null}

			{bodyState === 'empty' ? (
				<div
					className="rounded-md border border-border p-8 text-center text-sm text-muted"
					data-testid={`${testId}-empty`}
				>
					{emptyContent ?? 'No results found.'}
				</div>
			) : null}

			{bodyState === 'no-match' ? (
				<div
					className="rounded-md border border-border p-8 text-center text-sm text-muted"
					data-testid={`${testId}-no-match`}
				>
					{noMatchContent ?? 'No results match your search.'}
				</div>
			) : null}

			{bodyState === 'rows' ? (
				<Table aria-label={ariaLabel} data-testid={`${testId}-rows`}>
					<Table.ScrollContainer>
						<Table.Content
							{...tableSelectionProps}
							sortDescriptor={sortDescriptor}
							onSortChange={(descriptor) => {
								if (isSelectionMode) {
									return;
								}
								onSortChange(fromTableSortDescriptor(descriptor));
							}}
						>
							<Table.Header>
								{table.getHeaderGroups().flatMap((headerGroup) =>
									headerGroup.headers.map((header) => {
										const canSort = header.column.getCanSort();
										return (
											<Table.Column
												id={header.id}
												key={header.id}
												allowsSorting={canSort}
												isRowHeader={header.column.id === rowHeaderColumnId}
												// `!text-*` (important) because HeroUI's own `.table__column` rule
												// otherwise wins the cascade: its default header gray fails WCAG AA
												// color-contrast against the header background.
												className={`${cellPaddingClass} !text-foreground !font-medium`}
											>
												{canSort
													? ({ sortDirection }) => (
															<Table.SortableColumnHeader
																sortDirection={sortDirection}
																className="!text-foreground"
															>
																{flexRender(
																	header.column.columnDef.header,
																	header.getContext(),
																)}
															</Table.SortableColumnHeader>
														)
													: flexRender(
															header.column.columnDef.header,
															header.getContext(),
														)}
											</Table.Column>
										);
									}),
								)}
							</Table.Header>
							<Table.Body items={table.getRowModel().rows}>
								{(row) => (
									<Table.Row id={row.id} key={row.id}>
										{row.getVisibleCells().map((cell) => (
											<Table.Cell key={cell.id} className={cellPaddingClass}>
												{flexRender(
													cell.column.columnDef.cell,
													cell.getContext(),
												)}
											</Table.Cell>
										))}
									</Table.Row>
								)}
							</Table.Body>
						</Table.Content>
					</Table.ScrollContainer>
				</Table>
			) : null}

			<div className="flex items-center justify-between gap-4">
				<label className="flex items-center gap-2 text-sm text-muted">
					Rows per page
					<select
						className="rounded-md border border-border bg-transparent px-2 py-1"
						value={size}
						disabled={paginationDisabled}
						title={isSelectionMode ? SELECTION_LOCKED_TITLE : undefined}
						onChange={(event) => onSizeChange(Number(event.target.value))}
						data-testid={`${testId}-page-size`}
					>
						{PAGE_SIZE_OPTIONS.map((option) => (
							<option key={option} value={option}>
								{option}
							</option>
						))}
					</select>
				</label>

				<div className="flex items-center gap-2">
					<span
						className="text-sm text-muted"
						data-testid={`${testId}-page-label`}
					>
						Page {pageIndex + 1}
					</span>
					{isPaginationPending ? <Spinner size="sm" /> : null}
					<span title={isSelectionMode ? SELECTION_LOCKED_TITLE : undefined}>
						<Button
							variant="secondary"
							type="button"
							isDisabled={paginationDisabled || !hasPreviousPage}
							onPress={onPreviousPage}
							data-testid={`${testId}-prev-page`}
						>
							Previous
						</Button>
					</span>
					<span title={isSelectionMode ? SELECTION_LOCKED_TITLE : undefined}>
						<Button
							variant="secondary"
							type="button"
							isDisabled={paginationDisabled || !hasNextPage}
							onPress={onNextPage}
							data-testid={`${testId}-next-page`}
						>
							Next
						</Button>
					</span>
				</div>
			</div>
		</div>
	);
};
