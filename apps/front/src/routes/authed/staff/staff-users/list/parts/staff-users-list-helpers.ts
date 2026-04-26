import type { QueryClient } from '@tanstack/react-query';
import toStr from 'lodash/toString';

import type { BulkStaffUserActionResult } from '@org/client-ts/src/models';

import { useGetVerificationLink } from '#app/lib/react-query/features/common/auth.hooks.ts';
import {
	useFindStaffUser,
	useGetStaffUserById,
	useGetStaffUserProfiles,
} from '#app/lib/react-query/features/staff/staff-user.hooks.ts';

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

export const invalidateStaffUsersListAndDetails = async ({
	queryClient,
	userIds,
}: {
	queryClient: QueryClient;
	userIds: readonly string[];
}) => {
	const uniqueUserIds = getUniqueTruthyIds(userIds);

	await Promise.all([
		queryClient.invalidateQueries({
			queryKey: useFindStaffUser.getKey(),
		}),
		...uniqueUserIds.map((userId) => {
			return queryClient.invalidateQueries({
				queryKey: useGetStaffUserById.getKey({ userId }),
			});
		}),
	]);
};

export const clearDeletedStaffUserRelatedQueries = ({
	queryClient,
	userIds,
}: {
	queryClient: QueryClient;
	userIds: readonly string[];
}) => {
	for (const userId of getUniqueTruthyIds(userIds)) {
		queryClient.removeQueries({
			queryKey: useGetStaffUserProfiles.getKey({ userId }),
		});
		queryClient.removeQueries({
			queryKey: useGetVerificationLink.getKey({ userId }),
		});
	}
};
