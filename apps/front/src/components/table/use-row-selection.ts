import { useCallback, useEffect, useState } from 'react';

export type TableSelection = 'all' | Set<string>;
export type RowSelectionMap = Record<string, boolean>;

/** Drops selection entries for row ids that are no longer visible. */
export const pruneSelection = (
	selection: RowSelectionMap,
	visibleRowIds: readonly string[],
): RowSelectionMap => {
	const visible = new Set(visibleRowIds);
	const entries = Object.entries(selection).filter(([id]) => visible.has(id));

	if (entries.length === Object.keys(selection).length) {
		return selection;
	}
	return Object.fromEntries(entries);
};

export const countSelected = (selection: RowSelectionMap): number =>
	Object.values(selection).filter(Boolean).length;

export const toTableSelection = (
	selection: RowSelectionMap,
): TableSelection => {
	const selected = new Set<string>();
	for (const [id, checked] of Object.entries(selection)) {
		if (checked) {
			selected.add(id);
		}
	}
	return selected;
};

/** Local `TableSelection` from table event payload → stored row map. */
export const fromTableSelection = (
	next: TableSelection,
	visibleRowIds: readonly string[],
): RowSelectionMap => {
	if (next === 'all') {
		return Object.fromEntries(visibleRowIds.map((id) => [id, true]));
	}

	const visible = new Set(visibleRowIds);
	const entries: Array<[string, true]> = [];
	for (const key of next) {
		if (visible.has(key)) {
			entries.push([key, true]);
		}
	}

	return Object.fromEntries(entries);
};

export type UseRowSelectionResult = {
	rowSelection: RowSelectionMap;
	selectedKeys: TableSelection;
	selectedCount: number;
	isSelectionMode: boolean;
	onSelectionChange: (next: TableSelection) => void;
	clearSelection: () => void;
};

/**
 * Selection scaffold: row selection is pruned to whatever is currently
 * visible on every data change, so it never accumulates across cursor pages.
 * Bulk mutations are out of scope here (M2.3).
 */
export const useRowSelection = (visibleRowIds: readonly string[]) => {
	const [selection, setSelection] = useState<RowSelectionMap>({});
	const visibleKey = visibleRowIds.join(' ');

	useEffect(() => {
		setSelection((prev) => pruneSelection(prev, visibleRowIds));
		// visibleKey is the stable, content-based dependency for visibleRowIds.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [visibleKey]);

	const onSelectionChange = useCallback(
		(next: TableSelection) => {
			setSelection(fromTableSelection(next, visibleRowIds));
		},
		// visibleKey is the stable, content-based dependency for visibleRowIds.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[visibleKey],
	);

	const clearSelection = useCallback(() => setSelection({}), []);
	const selectedCount = countSelected(selection);

	return {
		rowSelection: selection,
		selectedKeys: toTableSelection(selection),
		selectedCount,
		isSelectionMode: selectedCount > 0,
		onSelectionChange,
		clearSelection,
	};
};
