import type { ListSelection } from '~/components/list/list-types';
import type { UseRowSelectionResult } from '~/components/table/use-row-selection';

/** The selected ids, derived from the rows the page currently renders. */
export const selectedListIds = <T extends { id: string }>(
	rows: T[],
	selection: UseRowSelectionResult,
): Set<string> => {
	const ids = new Set<string>();
	for (const row of rows) {
		if (selection.rowSelection[row.id]) {
			ids.add(row.id);
		}
	}
	return ids;
};

export const buildListSelection = <T extends { id: string }>(
	rows: T[],
	selection: UseRowSelectionResult,
	beforeChange?: () => void,
): ListSelection => ({
	selectedIds: selectedListIds(rows, selection),
	onToggle: (id) => {
		beforeChange?.();
		const next = selectedListIds(rows, selection);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		selection.onSelectionChange(next);
	},
	onToggleAll: (ids) => {
		beforeChange?.();
		const selected = selectedListIds(rows, selection);
		selection.onSelectionChange(
			selected.size === ids.length ? new Set() : new Set(ids),
		);
	},
});
