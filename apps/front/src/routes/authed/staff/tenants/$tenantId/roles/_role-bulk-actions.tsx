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
} from '~/lib/mutation-feedback/mutation-toast';
import {
	toStaffTenantRoleBulkActionSummary,
	useBulkDeleteStaffTenantRolesMutation,
	type StaffTenantRoleRow,
} from '~/lib/query/staff-tenant-roles';
import { invalidateAllStaffTenantScopes } from '~/lib/query/staff-tenants';

import { BULK_ACTION_MAX_COUNT } from '@org/shared-ts/lib/constants';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

export const RoleBulkActions = ({
	tenantId,
	rows,
	selection,
	onSessionExpired,
}: {
	tenantId: string;
	rows: StaffTenantRoleRow[];
	selection: UseRowSelectionResult;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const bulkDeleteMutation = useBulkDeleteStaffTenantRolesMutation();

	const selectedRows = rows.filter((row) => selection.rowSelection[row.id]);
	// The system role is protected by the API; default roles are not deletable
	// by product rule. Neither is sent, and the click below says so.
	const systemRoleCount = selectedRows.filter((row) => row.isFullAccess).length;
	const eligibleIds = selectedRows.flatMap((row) =>
		row.isDefault || row.isFullAccess ? [] : [row.id],
	);
	const selectedCount = selection.selectedCount;
	const isOverLimit = selectedCount > BULK_ACTION_MAX_COUNT;

	const performBulkDelete = async () => {
		let result;
		try {
			result = await bulkDeleteMutation.mutateAsync({
				tenantId,
				roleIds: eligibleIds,
			});
		} catch (error) {
			setIsDeleteDialogOpen(false);
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}

			await displayLocalMutationFailure(
				error,
				t('tenant-role-bulk-delete-failure'),
			);
			return;
		}

		setIsDeleteDialogOpen(false);
		selection.clearSelection();

		const summary = toStaffTenantRoleBulkActionSummary(result);
		if (summary.failedCount > 0) {
			// Only hint that rows may leave the filtered view when at least
			// one row actually changed state. On a total failure
			// (succeededCount === 0) nothing left the view, so the hint
			// would contradict the leading count message.
			toastLocalMutationResult.error(
				t('tenant-role-bulk-delete-partial-success', {
					succeeded: summary.succeededCount,
					failed: summary.failedCount,
				}),
				summary.succeededCount > 0
					? t('bulk-action-rows-may-leave-filter')
					: undefined,
			);
		} else {
			toastLocalMutationResult.success(
				t('tenant-role-bulk-delete-success', {
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
					if (systemRoleCount > 0) {
						toastLocalMutationResult.warning(
							t('bulk-delete-skips-system-role'),
						);
					}
					if (eligibleIds.length === 0) {
						if (systemRoleCount === 0) {
							toastLocalMutationResult.warning(
								t('bulk-delete-disabled-only-default-roles'),
							);
						}
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
				description={t('confirm-bulk-delete-tenant-roles', {
					count: eligibleIds.length,
				})}
				confirmLabel={t('delete')}
				isPending={bulkDeleteMutation.isPending}
				onConfirm={() => {
					void performBulkDelete();
				}}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						setIsDeleteDialogOpen(false);
					}
				}}
			/>
		</>
	);
};
