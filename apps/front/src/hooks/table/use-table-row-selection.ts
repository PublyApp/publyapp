import isEqual from 'lodash/isEqual';
import { type SetStateAction, useCallback, useMemo, useState } from 'react';

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
	const [rawRowSelection, setRawRowSelection] = useState<TableRowSelection>({});
	const rowSelection = useMemo(() => {
		if (!reconcileVisibleRows || !reconcileVisibleRowsEnabled) {
			return rawRowSelection;
		}

		return reconcileVisibleRowSelection(rawRowSelection, rows);
	}, [
		reconcileVisibleRows,
		reconcileVisibleRowsEnabled,
		rawRowSelection,
		rows,
	]);
	const setRowSelection = useCallback(
		(updater: SetStateAction<TableRowSelection>) => {
			setRawRowSelection((previousRawRowSelection) => {
				const baseRowSelection =
					reconcileVisibleRows && reconcileVisibleRowsEnabled
						? reconcileVisibleRowSelection(previousRawRowSelection, rows)
						: previousRawRowSelection;
				const nextRowSelection =
					typeof updater === 'function' ? updater(baseRowSelection) : updater;

				return isEqual(nextRowSelection, baseRowSelection)
					? previousRawRowSelection
					: nextRowSelection;
			});
		},
		[reconcileVisibleRows, reconcileVisibleRowsEnabled, rows],
	);

	const selectedRows = useMemo(() => {
		return rows.filter((row) => rowSelection[row.id]);
	}, [rowSelection, rows]);
	const selectedCount = selectedRows.length;
	const isSelectionMode = selectedCount > 0;
	const clearSelection = useCallback(() => {
		setRowSelection({});
	}, []);

	return {
		rowSelection,
		setRowSelection,
		selectedRows,
		selectedCount,
		isSelectionMode,
		clearSelection,
	};
};
