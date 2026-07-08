import {
	Button,
	Input,
	ListBox,
	Select,
	Skeleton,
	Spinner,
	Table,
} from '@heroui/react';
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import {
	ErrorStateSurface,
	NoMatchStateSurface,
	StateSurface,
} from '~/components/ui/state-surface';

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

	return (
		<div className="publy-data-table-shell" data-testid={testId}>
			<div
				className="publy-data-table-toolbar"
				data-testid={`${testId}-toolbar`}
			>
				<div className="publy-search-wrapper">
					<Search aria-hidden="true" className="publy-search-icon" />
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
							<Button variant="secondary" onPress={onRetry} type="button">
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
				>
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
												className={`${cellPaddingClass} publy-type-table-header`}
											>
												{canSort
													? ({ sortDirection }) => (
															<Table.SortableColumnHeader
																sortDirection={sortDirection}
																className="publy-type-table-header"
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

			<div className="publy-data-table-footer" data-testid={`${testId}-footer`}>
				<div className="flex items-center gap-2">
					<span className="text-sm text-foreground-500">Rows per page</span>
					<Select.Root
						aria-label="Rows per page"
						selectedKey={String(size)}
						onSelectionChange={(key) => {
							if (key) {
								onSizeChange(Number(key));
							}
						}}
						isDisabled={paginationDisabled}
						data-testid={`${testId}-page-size`}
					>
						<Select.Trigger data-testid={`${testId}-page-size-trigger`}>
							<Select.Value />
							<Select.Indicator />
						</Select.Trigger>
						<Select.Popover>
							<ListBox>
								{PAGE_SIZE_OPTIONS.map((option) => (
									<ListBox.Item key={String(option)} id={String(option)}>
										{option} rows
									</ListBox.Item>
								))}
							</ListBox>
						</Select.Popover>
					</Select.Root>
				</div>

				<div className="flex items-center gap-2">
					<span data-slot="page-label" data-testid={`${testId}-page-label`}>
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
							<ChevronLeft className="size-4" />
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
							<ChevronRight className="size-4" />
						</Button>
					</span>
				</div>
			</div>
		</div>
	);
};
