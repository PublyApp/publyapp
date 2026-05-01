import isEqual from 'lodash/isEqual';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type TableRowSelection = Record<string, boolean>;

type RowWithId = {
	id: string;
};

type UseTableRowSelectionArgs<TRow extends RowWithId> = {
	rows: readonly TRow[];
	reconcileVisibleRows?: boolean;
	reconcileVisibleRowsEnabled?: boolean;
};

const reconcileVisibleRowSelection = <TRow extends RowWithId>(
	rowSelection: TableRowSelection,
	rows: readonly TRow[],
) => {
	const visibleRowIds = new Set(rows.map((row) => row.id));
	const nextRowSelection: TableRowSelection = {};

	for (const [rowId, isSelected] of Object.entries(rowSelection)) {
		if (isSelected && visibleRowIds.has(rowId)) {
			nextRowSelection[rowId] = true;
		}
	}

	return nextRowSelection;
};

export const useTableRowSelection = <TRow extends RowWithId>({
	rows,
	reconcileVisibleRows = false,
	reconcileVisibleRowsEnabled = true,
}: UseTableRowSelectionArgs<TRow>) => {
	const [rowSelection, setRowSelection] = useState<TableRowSelection>({});
	const reconciledRowSelection = useMemo(() => {
		if (!reconcileVisibleRows || !reconcileVisibleRowsEnabled) {
			return rowSelection;
		}

		return reconcileVisibleRowSelection(rowSelection, rows);
	}, [reconcileVisibleRows, reconcileVisibleRowsEnabled, rowSelection, rows]);

	useEffect(() => {
		if (
			!reconcileVisibleRows ||
			!reconcileVisibleRowsEnabled ||
			isEqual(reconciledRowSelection, rowSelection)
		) {
			return;
		}

		// This intentionally writes state from an effect because selection is an
		// external MRT state bucket. After data mutations/refetches, selected row ids
		// that are no longer visible must be pruned before bulk actions can use them.
		setRowSelection(reconciledRowSelection);
	}, [
		reconcileVisibleRows,
		reconcileVisibleRowsEnabled,
		reconciledRowSelection,
		rowSelection,
	]);

	const selectedRows = useMemo(() => {
		return rows.filter((row) => reconciledRowSelection[row.id]);
	}, [reconciledRowSelection, rows]);
	const selectedCount = selectedRows.length;
	const isSelectionMode = selectedCount > 0;
	const clearSelection = useCallback(() => {
		setRowSelection({});
	}, []);

	return {
		rowSelection: reconciledRowSelection,
		setRowSelection,
		selectedRows,
		selectedCount,
		isSelectionMode,
		clearSelection,
	};
};
