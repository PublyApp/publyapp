import { useQueryClient } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';

import { toast } from '#app/components/snackbar/index.ts';
import type { TableRowSelection } from '#app/hooks/table/use-table-row-selection.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { getFailureMessage, toApiFailure } from '#app/lib/api-failure/index.ts';
import {
	useBulkRevokeStaffInvitations,
	useFindStaffInvitations,
} from '#app/lib/react-query/features/staff/staff-invitation.hooks.ts';

type BulkRevokeInvitationRow = {
	id: string;
};

type UseStaffInvitationBulkRevokeArgs = {
	eligibleRows: BulkRevokeInvitationRow[];
	clearSelection: () => void;
	setRowSelection: Dispatch<SetStateAction<TableRowSelection>>;
	closeDialog: () => void;
};

export const useStaffInvitationBulkRevoke = ({
	eligibleRows,
	clearSelection,
	setRowSelection,
	closeDialog,
}: UseStaffInvitationBulkRevokeArgs) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const { mutateAsync: bulkRevokeStaffInvitations, isPending: isBulkRevoking } =
		useBulkRevokeStaffInvitations({
			meta: { skipGlobalErrorHandler: true },
		});

	const handleBulkRevoke = async () => {
		const invitationIds: string[] = [];
		for (const invitation of eligibleRows) {
			invitationIds.push(invitation.id);
		}

		let result: Awaited<ReturnType<typeof bulkRevokeStaffInvitations>>;
		try {
			result = await bulkRevokeStaffInvitations({ invitationIds });
		} catch (error) {
			const failure = toApiFailure(error);
			const message = getFailureMessage(failure, {
				fallback: t('invitation-bulk-revoke-failure'),
			});
			closeDialog();
			toast.error(message);
			return;
		}

		const failedItems = result.failedItems ?? [];
		const succeeded = result.succeededCount ?? 0;
		const failed = result.failedCount ?? failedItems.length;
		const failedIds: string[] = [];

		for (const item of failedItems) {
			if (item.invitationId) {
				failedIds.push(item.invitationId);
			}
		}

		closeDialog();
		await queryClient.invalidateQueries({
			queryKey: useFindStaffInvitations.getKey(),
		});

		if (failed === 0) {
			clearSelection();
		} else {
			setRowSelection((prev) => {
				const next: typeof prev = {};
				for (const id of failedIds) {
					if (prev[id]) {
						next[id] = true;
					}
				}
				return next;
			});
		}

		if (succeeded === 0 && failed > 0) {
			toast.error(t('invitation-bulk-revoke-failure'));
			return;
		}

		if (failed > 0) {
			toast.warning(
				t('invitation-bulk-revoke-partial-success', {
					succeeded,
					failed,
				}),
			);
			return;
		}

		toast.success(
			t('invitation-bulk-revoke-success', {
				count: succeeded,
			}),
		);
	};

	return {
		handleBulkRevoke,
		isBulkRevoking,
	};
};
