import { IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FLOATING_SELECTION_BAR_ACTION_BUTTON_CLASS_NAME } from '~/components/table/floating-selection-bar';
import type { UseRowSelectionResult } from '~/components/table/use-row-selection';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import {
	toStaffTenantProfileBulkActionSummary,
	useBulkDeleteStaffTenantProfilesMutation,
	type StaffTenantProfileRow,
} from '~/lib/query/staff-tenant-profiles';
import { invalidateAllStaffTenantScopes } from '~/lib/query/staff-tenants';

import { BULK_ACTION_MAX_COUNT } from '@org/shared-ts/lib/constants';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

export const ProfileBulkActions = ({
	tenantId,
	rows,
	selection,
	onSessionExpired,
}: {
	tenantId: string;
	rows: StaffTenantProfileRow[];
	selection: UseRowSelectionResult;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const bulkDeleteMutation = useBulkDeleteStaffTenantProfilesMutation();

	const selectedRows = rows.filter((row) => selection.rowSelection[row.id]);
	const eligibleIds = selectedRows.flatMap((row) =>
		row.isDefault ? [] : [row.id],
	);
	const selectedCount = selection.selectedCount;
	const isOverLimit = selectedCount > BULK_ACTION_MAX_COUNT;

	const performBulkDelete = async () => {
		let result;
		try {
			result = await bulkDeleteMutation.mutateAsync({
				tenantId,
				profileIds: eligibleIds,
			});
		} catch (error) {
			setIsDeleteDialogOpen(false);
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}

			await displayLocalMutationFailure(
				error,
				t('tenant-profile-bulk-delete-failure'),
			);
			return;
		}

		setIsDeleteDialogOpen(false);
		selection.clearSelection();

		const summary = toStaffTenantProfileBulkActionSummary(result);
		if (summary.failedCount > 0) {
			toastLocalMutationResult.error(
				t('tenant-profile-bulk-delete-partial-success', {
					succeeded: summary.succeededCount,
					failed: summary.failedCount,
				}),
				t('bulk-action-rows-may-leave-filter'),
			);
		} else {
			toastLocalMutationResult.success(
				t('tenant-profile-bulk-delete-success', {
					count: summary.succeededCount,
				}),
				t('bulk-action-rows-may-leave-filter'),
			);
		}

		await invalidateAllStaffTenantScopes(queryClient);
	};

	return (
		<>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				disabled={isOverLimit}
				title={
					isOverLimit
						? t('bulk-action-max-count-exceeded', {
								max: BULK_ACTION_MAX_COUNT,
								count: selectedCount,
							})
						: undefined
				}
				className={FLOATING_SELECTION_BAR_ACTION_BUTTON_CLASS_NAME}
				onClick={() => {
					if (eligibleIds.length === 0) {
						toastLocalMutationResult.warning(
							t('bulk-delete-disabled-only-default-profiles'),
						);
						return;
					}
					setIsDeleteDialogOpen(true);
				}}
			>
				<IconTrash className="size-[15px]" />
				{t('bulk-delete')}
			</Button>

			<ConfirmDialog
				isOpen={isDeleteDialogOpen}
				title={t('bulk-delete')}
				description={t('confirm-bulk-delete-tenant-profiles', {
					count: eligibleIds.length,
				})}
				confirmLabel={t('delete')}
				isPending={bulkDeleteMutation.isPending}
				onConfirm={() => {
					void performBulkDelete();
				}}
				onOpenChange={(isOpen) => {
					if (!isOpen) setIsDeleteDialogOpen(false);
				}}
			/>
		</>
	);
};
