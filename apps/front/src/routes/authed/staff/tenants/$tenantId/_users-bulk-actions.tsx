import { IconDownload, IconUserMinus } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UseRowSelectionResult } from '~/components/table/use-row-selection';
import {
	type BulkActionMenuItem,
	BulkActionsMenu,
	BulkActionsTrigger,
} from '~/components/ui/bulk-actions-trigger';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DropdownMenu } from '~/components/ui/dropdown-menu';
import { downloadFile, formatExportDateStamp } from '~/lib/download-file';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import {
	toStaffTenantUserBulkActionSummary,
	useBulkRemoveStaffTenantUsersMutation,
	useExportStaffTenantUsersMutation,
	type StaffTenantUserRow,
} from '~/lib/query/staff-tenant-users';
import { invalidateAllStaffTenantScopes } from '~/lib/query/staff-tenants';

import { BULK_ACTION_MAX_COUNT } from '@org/shared-ts/lib/constants';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

export const TenantUserBulkActions = ({
	tenantId,
	tenantCode,
	rows,
	selection,
	onSessionExpired,
}: {
	tenantId: string;
	tenantCode: string | null;
	rows: StaffTenantUserRow[];
	selection: UseRowSelectionResult;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);
	const bulkRemoveMutation = useBulkRemoveStaffTenantUsersMutation();
	const exportMutation = useExportStaffTenantUsersMutation();

	const selectedIds = rows.flatMap((row) =>
		selection.rowSelection[row.id] ? [row.id] : [],
	);
	const selectedCount = selection.selectedCount;
	const isOverLimit = selectedCount > BULK_ACTION_MAX_COUNT;
	const isActionPending =
		bulkRemoveMutation.isPending || exportMutation.isPending;

	const selectionBarMenuItems: readonly BulkActionMenuItem[] = [
		{
			key: 'export',
			label: t('export-selected-users'),
			icon: <IconDownload />,
		},
		{
			key: 'remove',
			label: t('remove-selected-from-tenant'),
			icon: <IconUserMinus />,
			variant: 'destructive',
			disabled: isActionPending,
		},
	];

	const performExport = async () => {
		if (selectedIds.length === 0 || isOverLimit) {
			toastLocalMutationResult.error(t('export-failed'));
			return;
		}

		let data: ArrayBuffer | undefined;
		try {
			data = await exportMutation.mutateAsync({
				tenantId,
				ids: selectedIds,
			});
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}

			await displayLocalMutationFailure(error, t('export-failed'));
			return;
		}

		if (!data) {
			toastLocalMutationResult.error(t('export-failed'));
			return;
		}

		try {
			downloadFile({
				data,
				fileName: `${tenantCode ?? tenantId}-members-${formatExportDateStamp(new Date())}.csv`,
				mimeType: 'text/csv',
			});
		} catch {
			toastLocalMutationResult.error(t('export-failed'));
			return;
		}

		toastLocalMutationResult.success(t('export-completed-success'));
	};

	const performBulkRemove = async () => {
		if (selectedIds.length === 0 || isOverLimit) {
			toastLocalMutationResult.error(t('tenant-user-bulk-remove-failure'));
			return;
		}

		let result;
		try {
			result = await bulkRemoveMutation.mutateAsync({
				tenantId,
				userIds: selectedIds,
			});
		} catch (error) {
			setIsRemoveDialogOpen(false);
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}

			await displayLocalMutationFailure(
				error,
				t('tenant-user-bulk-remove-failure'),
			);
			return;
		}

		setIsRemoveDialogOpen(false);
		selection.clearSelection();
		await invalidateAllStaffTenantScopes(queryClient);

		const summary = toStaffTenantUserBulkActionSummary(result);
		if (summary.failedCount === 0) {
			toastLocalMutationResult.success(
				t('tenant-user-bulk-remove-success', {
					count: summary.succeededCount,
				}),
			);
			return;
		}

		toastLocalMutationResult.error(
			summary.succeededCount === 0
				? t('tenant-user-bulk-remove-failure')
				: t('tenant-user-bulk-remove-partial-success', {
						succeeded: summary.succeededCount,
						failed: summary.failedCount,
					}),
		);
	};

	return (
		<>
			<DropdownMenu>
				<BulkActionsTrigger
					triggerLabel={t('bulk-actions')}
					isOverLimit={isOverLimit}
					overLimitMessage={t('bulk-action-max-count-exceeded', {
						max: BULK_ACTION_MAX_COUNT,
						count: selectedCount,
					})}
				/>
				<BulkActionsMenu
					items={selectionBarMenuItems}
					onMenuItemClick={(key) => {
						if (key === 'export') {
							void performExport();
						} else if (key === 'remove') {
							setIsRemoveDialogOpen(true);
						}
					}}
				/>
			</DropdownMenu>

			<ConfirmDialog
				isOpen={isRemoveDialogOpen}
				title={t('remove-selected-from-tenant')}
				description={t('confirm-bulk-remove-tenant-users', {
					count: selectedCount,
				})}
				confirmLabel={t('remove')}
				isPending={bulkRemoveMutation.isPending}
				onConfirm={() => {
					void performBulkRemove();
				}}
				onOpenChange={(isOpen) => {
					if (!isOpen) setIsRemoveDialogOpen(false);
				}}
			/>
		</>
	);
};
