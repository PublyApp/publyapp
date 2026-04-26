import toStr from 'lodash/toString';

import type { BulkStaffUserActionResult } from '@org/client-ts/src/models';

type RowSelection = Record<string, boolean>;
type RowWithId = {
	id: string;
};

const getUniqueTruthyIds = (userIds: readonly string[]) => {
	const uniqueIds = new Set<string>();

	for (const userId of userIds) {
		if (!userId) {
			continue;
		}

		uniqueIds.add(userId);
	}

	return Array.from(uniqueIds);
};

export const reconcileVisibleRowSelection = <TRow extends RowWithId>(
	rowSelection: RowSelection,
	rows: readonly TRow[],
) => {
	const visibleRowIds = new Set(rows.map((row) => row.id));
	const nextRowSelection: RowSelection = {};

	for (const [rowId, isSelected] of Object.entries(rowSelection)) {
		if (isSelected && visibleRowIds.has(rowId)) {
			nextRowSelection[rowId] = true;
		}
	}

	return nextRowSelection;
};

export const getSuccessfulBulkStaffUserIds = ({
	requestedUserIds,
	result,
}: {
	requestedUserIds: readonly string[];
	result: Pick<BulkStaffUserActionResult, 'failedItems'>;
}) => {
	const successfulUserIds = new Set(getUniqueTruthyIds(requestedUserIds));

	for (const failedItem of result.failedItems ?? []) {
		const failedUserId = toStr(failedItem.userId);

		if (!failedUserId) {
			continue;
		}

		successfulUserIds.delete(failedUserId);
	}

	return Array.from(successfulUserIds);
};
