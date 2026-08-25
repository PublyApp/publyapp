import {
	IconChevronDown,
	IconDownload,
	IconUserMinus,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FLOATING_SELECTION_BAR_ACTION_BUTTON_CLASS_NAME } from '~/components/table/floating-selection-bar';
import type { UseRowSelectionResult } from '~/components/table/use-row-selection';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
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
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import { BULK_ACTION_MAX_COUNT } from '@org/shared-ts/lib/constants';

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
				<DropdownMenuTrigger
					render={
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
									: t('more-actions')
							}
							aria-label={t('more-actions')}
							className={FLOATING_SELECTION_BAR_ACTION_BUTTON_CLASS_NAME}
						/>
					}
				>
					{t('bulk-actions')}
					<IconChevronDown aria-hidden="true" className="size-3" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" side="top" sideOffset={6}>
					<DropdownMenuItem
						disabled={isActionPending}
						onClick={() => {
							void performExport();
						}}
					>
						<IconDownload />
						{t('export-selected-users')}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						disabled={isActionPending}
						onClick={() => setIsRemoveDialogOpen(true)}
					>
						<IconUserMinus />
						{t('remove-selected-from-tenant')}
					</DropdownMenuItem>
				</DropdownMenuContent>
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
