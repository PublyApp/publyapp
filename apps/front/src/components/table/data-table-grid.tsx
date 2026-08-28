import type { LegacyReactTable as TanStackTable } from '@tanstack/react-table/legacy';
import { Table } from '~/components/ui/table';

import { columnDisplayMeta, resolveColumnWidth } from './column-display-meta';
import { DataTableBodyRows } from './data-table-body-rows';
import type { FocusedCell } from './data-table-body-rows';
import { DataTableHeaderRow } from './data-table-header-row';
import type { SortState } from './sort-descriptor';
import type { TableRowHeight } from './table-row-height';
import type { UseRowSelectionResult } from './use-row-selection';

export type DataTableGridProps<TData extends { id: string }> = {
	testId: string;
	ariaLabel: string;
	table: TanStackTable<TData>;
	matchedBreakpoints: ReadonlySet<number>;
	resolvedRowHeight: TableRowHeight;
	isSelectionMode: boolean;
	onSortChange: (nextSort: SortState | undefined) => void;
	selection?: UseRowSelectionResult;
	getRowLabel: (row: TData) => string;
	focusedCell: FocusedCell;
	onFocusedCellChange: (nextFocusedCell: FocusedCell) => void;
};

/** The `<table>` itself: colgroup plus the header and body rows, with the
 * selection derivations they share. Extracted from `DataTable` verbatim —
 * same DOM, same handlers. */
export const DataTableGrid = <TData extends { id: string }>({
	testId,
	ariaLabel,
	table,
	matchedBreakpoints,
	resolvedRowHeight,
	isSelectionMode,
	onSortChange,
	selection,
	getRowLabel,
	focusedCell,
	onFocusedCellChange,
}: DataTableGridProps<TData>) => {
	// "use no memo" — derives every cell of the grid from the mutable TanStack
	// `table` instance each render; see data-table.tsx for the full rationale.
	'use no memo';
	const hasSelection = selection != null;

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

	const totalCellsPerRow =
		table.getVisibleLeafColumns().length + (hasSelection ? 1 : 0);

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

	return (
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
					const width = resolveColumnWidth(displayMeta, matchedBreakpoints);
					return <col key={column.id} style={width ? { width } : undefined} />;
				})}
			</colgroup>
			<DataTableHeaderRow
				table={table}
				tableSort={tableSort}
				isSelectionMode={isSelectionMode}
				onSortChange={onSortChange}
				selectionHeader={
					hasSelection
						? {
								allRowsSelected,
								hasPartialSelection,
								onToggleSelectAll: handleToggleSelectAll,
							}
						: undefined
				}
			/>
			<DataTableBodyRows
				rowModels={rowModels}
				totalCellsPerRow={totalCellsPerRow}
				focusedCell={focusedCell}
				onFocusedCellChange={onFocusedCellChange}
				rowSelection={
					hasSelection
						? {
								selectedRowIds,
								onToggleRowSelection: handleToggleRowSelection,
								getRowLabel,
							}
						: undefined
				}
			/>
		</Table>
	);
};
