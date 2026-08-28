import { flexRender } from '@tanstack/react-table';
import type { LegacyRow as Row } from '@tanstack/react-table/legacy';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '~/components/ui/checkbox';
import { TableBody, TableCell, TableRow } from '~/components/ui/table';

import { columnDisplayMeta } from './column-display-meta';

// v9 moved RowData to table-core; this alias keeps the constraint local.
type RowData = Record<string, unknown>;

/** Roving-tabindex position: the single body cell that is a tab stop. */
export type FocusedCell = { row: number; cell: number };

/** Per-row selection wiring for the leading checkbox cell. Omitted entirely
 * when the table has no selection. */
type RowSelectionState<TData> = {
	selectedRowIds: Record<string, boolean>;
	onToggleRowSelection: (rowId: string) => void;
	getRowLabel: (row: TData) => string;
};

const focusCellAt = (
	tableBody: HTMLTableSectionElement | null,
	rowIndex: number,
	cellIndex: number,
): HTMLTableCellElement | null =>
	tableBody?.querySelector<HTMLTableCellElement>(
		`tr[data-row-index="${rowIndex}"] td[data-cell-index="${cellIndex}"]`,
	) ?? null;

export type DataTableBodyRowsProps<TData extends RowData> = {
	rowModels: Row<TData>[];
	totalCellsPerRow: number;
	focusedCell: FocusedCell;
	onFocusedCellChange: (nextFocusedCell: FocusedCell) => void;
	rowSelection?: RowSelectionState<TData>;
};

/** The body rows, their selection checkboxes and the roving-tabindex grid
 * navigation. Extracted from `DataTable` verbatim — same DOM, same handlers. */
export const DataTableBodyRows = <TData extends RowData>({
	rowModels,
	totalCellsPerRow,
	focusedCell,
	onFocusedCellChange,
	rowSelection,
}: DataTableBodyRowsProps<TData>) => {
	const { t } = useTranslation('common');
	const hasSelection = rowSelection != null;
	const selectedRowIds = rowSelection?.selectedRowIds ?? {};

	// Roving tabindex (shell F3): only one body cell is ever a tab stop, so a
	// keyboard user reaches the pager in one Tab press instead of rowCount ×
	// colCount. Arrow-key navigation (handleCellNavigation below) moves focus
	// programmatically, which fires onFocus and rolls the tab stop with it.
	// Clamped defensively against the current row/column counts so a stale
	// position (e.g. after a filter shrinks the row count) never lands on a
	// cell that no longer exists, which would leave the whole table
	// unreachable by Tab.
	const safeFocusedRow =
		rowModels.length === 0
			? 0
			: Math.min(focusedCell.row, rowModels.length - 1);
	const safeFocusedCellIndex =
		totalCellsPerRow === 0
			? 0
			: Math.min(focusedCell.cell, totalCellsPerRow - 1);

	/**
	 * `role="grid"` promises the full WAI-ARIA APG "Data Grid" 2D arrow-key
	 * contract, not just vertical movement (r3-shell-F8): ArrowLeft/ArrowRight
	 * move within the row (clamped to the visible column range) and Home/End
	 * jump to the row's first/last cell — all reusing the same
	 * `data-cell-index`/`data-row-index` lookup ArrowDown/ArrowUp already did.
	 */
	const handleCellNavigation = (
		event: KeyboardEvent<HTMLTableCellElement>,
		currentRowIndex: number,
		currentCellIndex: number,
	): void => {
		const tableBody = event.currentTarget.closest('tbody');

		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			const rowDelta = event.key === 'ArrowDown' ? 1 : -1;
			const nextRowIndex = currentRowIndex + rowDelta;
			if (nextRowIndex < 0 || nextRowIndex >= rowModels.length) {
				return;
			}

			const nextCell = focusCellAt(tableBody, nextRowIndex, currentCellIndex);
			if (nextCell) {
				event.preventDefault();
				nextCell.focus();
			}
			return;
		}

		let nextCellIndex: number | undefined;
		if (event.key === 'ArrowRight') {
			nextCellIndex = currentCellIndex + 1;
		} else if (event.key === 'ArrowLeft') {
			nextCellIndex = currentCellIndex - 1;
		} else if (event.key === 'Home') {
			nextCellIndex = 0;
		} else if (event.key === 'End') {
			nextCellIndex = totalCellsPerRow - 1;
		}

		if (
			nextCellIndex === undefined ||
			nextCellIndex < 0 ||
			nextCellIndex >= totalCellsPerRow
		) {
			return;
		}

		const nextCell = focusCellAt(tableBody, currentRowIndex, nextCellIndex);
		if (nextCell) {
			event.preventDefault();
			nextCell.focus();
		}
	};

	return (
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
						{rowSelection ? (
							<TableCell
								data-cell-index={0}
								data-slot="table-selection-cell"
								role="gridcell"
								tabIndex={
									rowIndex === safeFocusedRow && safeFocusedCellIndex === 0
										? 0
										: -1
								}
								onFocus={() => {
									onFocusedCellChange({ row: rowIndex, cell: 0 });
								}}
								onKeyDown={(event) => {
									handleCellNavigation(event, rowIndex, 0);
								}}
							>
								<Checkbox
									checked={isRowSelected}
									onCheckedChange={() => {
										rowSelection.onToggleRowSelection(row.id);
									}}
									aria-label={t('select-row-named', {
										name: rowSelection.getRowLabel(row.original),
									})}
								/>
							</TableCell>
						) : null}
						{visibleCells.map((cell, cellIndex) => {
							const renderedCellIndex = hasSelection
								? cellIndex + 1
								: cellIndex;
							const displayMeta = columnDisplayMeta(cell.column.columnDef);
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
										onFocusedCellChange({
											row: rowIndex,
											cell: renderedCellIndex,
										});
									}}
									onKeyDown={(event) => {
										handleCellNavigation(event, rowIndex, renderedCellIndex);
									}}
								>
									{flexRender(cell.column.columnDef.cell, cell.getContext())}
								</TableCell>
							);
						})}
					</TableRow>
				);
			})}
		</TableBody>
	);
};
