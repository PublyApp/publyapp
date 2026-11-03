import { IconPlayerPause, IconRefresh, IconTrash } from '@tabler/icons-react';
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
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-feedback/mutation-toast';
import {
	invalidateStaffTenants,
	type StaffTenantRow,
	useBulkDeleteStaffTenantsMutation,
	useBulkReactivateStaffTenantsMutation,
	useBulkSuspendStaffTenantsMutation,
} from '~/lib/query/staff-tenants';

import { BULK_ACTION_MAX_COUNT } from '@org/shared-ts/lib/constants';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import type { PendingLifecycleAction } from './_tenants-list-row-actions';

const TENANT_STATUS_ACTIVE = 'Active';
const TENANT_STATUS_SUSPENDED = 'Suspended';

type TenantBulkActionKey = 'suspend' | 'reactivate' | 'delete';

const TENANT_BULK_FAILURE_KEYS = {
	suspend: 'tenant-bulk-suspend-failure',
	reactivate: 'tenant-bulk-reactivate-failure',
	delete: 'tenant-bulk-delete-failure',
} satisfies Record<TenantBulkActionKey, string>;

const TENANT_BULK_SUCCESS_KEYS = {
	suspend: 'tenant-bulk-suspend-success',
	reactivate: 'tenant-bulk-reactivate-success',
	delete: 'tenant-bulk-delete-success',
} satisfies Record<TenantBulkActionKey, string>;

const TENANT_BULK_PARTIAL_SUCCESS_KEYS = {
	suspend: 'tenant-bulk-suspend-partial-success',
	reactivate: 'tenant-bulk-reactivate-partial-success',
	delete: 'tenant-bulk-delete-partial-success',
} satisfies Record<TenantBulkActionKey, string>;

const getBulkConfirmDialogConfig = (
	action: PendingLifecycleAction,
	count: number,
	t: (key: string, options?: Record<string, unknown>) => string,
) => {
	switch (action) {
		case 'suspend':
			return {
				title: t('bulk-suspend'),
				description: t('bulk-suspend-confirm', { count }),
				confirmLabel: t('suspend'),
			};
		case 'reactivate':
			return {
				title: t('bulk-reactivate'),
				description: t('bulk-reactivate-confirm', { count }),
				confirmLabel: t('reactivate'),
			};
		case 'delete':
			return {
				title: t('bulk-delete'),
				description: t('bulk-delete-confirm', { count }),
				confirmLabel: t('delete'),
			};
		default:
			return { title: '', description: '', confirmLabel: '' };
	}
};

/**
 * The organisations list's bulk lifecycle actions. Menu items always render
 * (docs/guides/bulk-action-ux-conventions.md): an ineligible click shows the
 * reason as a toast instead of disabling or hiding the item.
 */
export const TenantBulkActions = ({
	rows,
	selection,
	onSessionExpired,
}: {
	rows: StaffTenantRow[];
	selection: UseRowSelectionResult;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [pendingAction, setPendingAction] =
		useState<PendingLifecycleAction>(null);
	const bulkSuspendMutation = useBulkSuspendStaffTenantsMutation();
	const bulkReactivateMutation = useBulkReactivateStaffTenantsMutation();
	const bulkDeleteMutation = useBulkDeleteStaffTenantsMutation();

	const selectedTenants = rows.filter((row) => selection.rowSelection[row.id]);
	const selectedCount = selection.selectedCount;
	const isOverLimit = selectedCount > BULK_ACTION_MAX_COUNT;
	const isActionPending =
		bulkSuspendMutation.isPending ||
		bulkReactivateMutation.isPending ||
		bulkDeleteMutation.isPending;

	const eligibleIdsFor = (action: PendingLifecycleAction): string[] => {
		if (action === 'suspend') {
			return selectedTenants.flatMap((tenant) =>
				tenant.status === TENANT_STATUS_ACTIVE ? [tenant.id] : [],
			);
		}
		if (action === 'reactivate') {
			return selectedTenants.flatMap((tenant) =>
				tenant.status === TENANT_STATUS_SUSPENDED ? [tenant.id] : [],
			);
		}
		if (action === 'delete') {
			const allSelectedAreSuspended =
				selectedTenants.length > 0 &&
				selectedTenants.every(
					(tenant) => tenant.status === TENANT_STATUS_SUSPENDED,
				);
			if (allSelectedAreSuspended) {
				return selectedTenants.map((tenant) => tenant.id);
			}
			return [];
		}
		return [];
	};

	const ineligibleMessageFor = (action: PendingLifecycleAction): string => {
		if (action === 'suspend') {
			return t('bulk-suspend-disabled-no-active-tenants');
		}
		if (action === 'reactivate') {
			return t('bulk-reactivate-disabled-no-suspended-tenants');
		}
		return t('bulk-delete-disabled-until-all-tenants-suspended');
	};

	const handleMenuItemClick = (action: TenantBulkActionKey) => {
		if (eligibleIdsFor(action).length === 0) {
			toastLocalMutationResult.warning(ineligibleMessageFor(action));
			return;
		}
		setPendingAction(action);
	};

	const performBulkAction = async (action: TenantBulkActionKey) => {
		const eligibleIds = eligibleIdsFor(action);

		let result;
		try {
			if (action === 'suspend') {
				result = await bulkSuspendMutation.mutateAsync({
					tenantIds: eligibleIds,
				});
			} else if (action === 'reactivate') {
				result = await bulkReactivateMutation.mutateAsync({
					tenantIds: eligibleIds,
				});
			} else {
				result = await bulkDeleteMutation.mutateAsync({
					tenantIds: eligibleIds,
				});
			}
		} catch (error) {
			setPendingAction(null);
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}

			await displayLocalMutationFailure(
				error,
				t(TENANT_BULK_FAILURE_KEYS[action]),
			);
			return;
		}

		setPendingAction(null);
		selection.clearSelection();

		const succeededCount = result?.succeededCount ?? 0;
		const failedCount = result?.failedCount ?? 0;
		const failedItems = result?.failedItems ?? [];

		if (failedCount > 0) {
			// Transparent failure causes: each per-item reason verbatim,
			// deduplicated and order-preserved.
			const reasons = [
				...new Set(
					failedItems.flatMap((item) => {
						const reason = item.errorEscaped?.trim();
						return reason ? [reason] : [];
					}),
				),
			];
			const filterWarning =
				succeededCount > 0 ? t('bulk-action-rows-may-leave-filter') : undefined;
			const noReasonFallback =
				succeededCount === 0 && reasons.length === 0
					? t('bulk-action-total-failure-no-reason')
					: undefined;
			toastLocalMutationResult.error(
				t(TENANT_BULK_PARTIAL_SUCCESS_KEYS[action], {
					succeeded: succeededCount,
					failed: failedCount,
				}),
				reasons.length > 0
					? reasons.join('\n')
					: (filterWarning ?? noReasonFallback),
			);
		} else {
			toastLocalMutationResult.success(
				t(TENANT_BULK_SUCCESS_KEYS[action], { count: succeededCount }),
				t('bulk-action-rows-may-leave-filter'),
			);
		}

		await invalidateStaffTenants(queryClient);
	};

	const dialogConfig = getBulkConfirmDialogConfig(
		pendingAction,
		eligibleIdsFor(pendingAction).length,
		t,
	);

	const menuItems: readonly BulkActionMenuItem<TenantBulkActionKey>[] = [
		{ key: 'reactivate', label: t('bulk-reactivate'), icon: <IconRefresh /> },
		{
			key: 'suspend',
			label: t('bulk-suspend'),
			icon: <IconPlayerPause />,
			variant: 'destructive',
			disabled: isActionPending,
		},
		{
			key: 'delete',
			label: t('bulk-delete'),
			icon: <IconTrash />,
			variant: 'destructive',
			disabled: isActionPending,
		},
	];

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
					items={menuItems}
					onMenuItemClick={handleMenuItemClick}
				/>
			</DropdownMenu>

			<ConfirmDialog
				isOpen={pendingAction !== null}
				title={dialogConfig.title}
				description={dialogConfig.description}
				confirmLabel={dialogConfig.confirmLabel}
				isPending={isActionPending}
				onConfirm={() => {
					if (pendingAction) {
						void performBulkAction(pendingAction);
					}
				}}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						setPendingAction(null);
					}
				}}
			/>
		</>
	);
};
