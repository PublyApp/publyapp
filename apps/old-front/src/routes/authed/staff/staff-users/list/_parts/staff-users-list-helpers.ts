import toStr from 'lodash/toString';

import type { BulkStaffUserActionResult } from '@org/client-ts/src/models';

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
