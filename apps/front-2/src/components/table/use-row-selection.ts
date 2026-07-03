import type { Selection } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

export type RowSelectionMap = Record<string, boolean>;

/** Drops selection entries for row ids that are no longer visible. */
export const pruneSelection = (
	selection: RowSelectionMap,
	visibleRowIds: readonly string[],
): RowSelectionMap => {
	const visible = new Set(visibleRowIds);
	const entries = Object.entries(selection).filter(([id]) => visible.has(id));

	return entries.length === Object.keys(selection).length
		? selection
		: Object.fromEntries(entries);
};

export const countSelected = (selection: RowSelectionMap): number =>
	Object.values(selection).filter(Boolean).length;

export const toHeroSelection = (selection: RowSelectionMap): Selection =>
	new Set(
		Object.entries(selection)
			.filter(([, checked]) => checked)
			.map(([id]) => id),
	);

/** HeroUI's `Selection` always describes the desired state of the currently rendered rows. */
export const fromHeroSelection = (
	next: Selection,
	visibleRowIds: readonly string[],
): RowSelectionMap => {
	if (next === 'all') {
		return Object.fromEntries(visibleRowIds.map((id) => [id, true]));
	}

	return Object.fromEntries(Array.from(next, (key) => [String(key), true]));
};

export type UseRowSelectionResult = {
	rowSelection: RowSelectionMap;
	selectedKeys: Selection;
	selectedCount: number;
	isSelectionMode: boolean;
	onSelectionChange: (next: Selection) => void;
	clearSelection: () => void;
};

/**
 * Selection scaffold: row selection is pruned to whatever is currently
 * visible on every data change, so it never accumulates across cursor pages.
 * Bulk mutations are out of scope here (M2.3).
 */
export const useRowSelection = (
	visibleRowIds: readonly string[],
): UseRowSelectionResult => {
	const [selection, setSelection] = useState<RowSelectionMap>({});
	const visibleKey = visibleRowIds.join(' ');

	useEffect(() => {
		setSelection((prev) => pruneSelection(prev, visibleRowIds));
		// visibleKey is the stable, content-based dependency for visibleRowIds.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [visibleKey]);

	const onSelectionChange = useCallback(
		(next: Selection) => {
			setSelection(fromHeroSelection(next, visibleRowIds));
		},
		// visibleKey is the stable, content-based dependency for visibleRowIds.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[visibleKey],
	);

	const clearSelection = useCallback(() => setSelection({}), []);
	const selectedCount = countSelected(selection);

	return {
		rowSelection: selection,
		selectedKeys: toHeroSelection(selection),
		selectedCount,
		isSelectionMode: selectedCount > 0,
		onSelectionChange,
		clearSelection,
	};
};
