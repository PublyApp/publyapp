import { IconPlayerPause, IconRefresh, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTableRowActions } from '~/components/table/row-actions';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from '~/components/ui/dropdown-menu';
import {
	invalidateStaffTenants,
	type StaffTenantRow,
	useDeleteStaffTenantMutation,
	useReactivateStaffTenantMutation,
	useSuspendStaffTenantMutation,
} from '~/lib/query/staff-tenants';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

export type PendingLifecycleAction = 'suspend' | 'reactivate' | 'delete' | null;

const TENANT_STATUS_ACTIVE = 'Active';
const TENANT_STATUS_SUSPENDED = 'Suspended';

const getConfirmDialogConfig = (
	action: PendingLifecycleAction,
	tenantName: string,
	t: (key: string, options?: Record<string, unknown>) => string,
) => {
	switch (action) {
		case 'suspend':
			return {
				title: t('suspend-tenant'),
				description: t('suspend-tenant-confirm', { name: tenantName }),
				confirmLabel: t('suspend'),
			};
		case 'reactivate':
			return {
				title: t('reactivate-tenant'),
				description: t('reactivate-tenant-confirm', { name: tenantName }),
				confirmLabel: t('reactivate'),
			};
		case 'delete':
			return {
				title: t('confirm-delete-tenant-title'),
				description: t('confirm-delete-tenant-message'),
				confirmLabel: t('delete'),
			};
		default:
			return { title: '', description: '', confirmLabel: '' };
	}
};

/**
 * A tenant row's lifecycle actions: suspend an active tenant, reactivate or
 * delete a suspended one; a Pending tenant has no eligible action and shows
 * an em dash (the same rule as develop's page).
 */
export const TenantLifecycleActionsCell = ({
	tenant,
	onSessionExpired,
}: {
	tenant: StaffTenantRow;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [pendingAction, setPendingAction] =
		useState<PendingLifecycleAction>(null);
	const suspendTenantMutation = useSuspendStaffTenantMutation();
	const reactivateTenantMutation = useReactivateStaffTenantMutation();
	const deleteTenantMutation = useDeleteStaffTenantMutation();

	const canSuspend = tenant.status === TENANT_STATUS_ACTIVE;
	const canReactivate = tenant.status === TENANT_STATUS_SUSPENDED;
	const canDelete = tenant.status === TENANT_STATUS_SUSPENDED;
	const isActionPending =
		suspendTenantMutation.isPending ||
		reactivateTenantMutation.isPending ||
		deleteTenantMutation.isPending;

	const performAction = async (action: 'suspend' | 'reactivate' | 'delete') => {
		try {
			if (action === 'suspend') {
				await suspendTenantMutation.mutateAsync({ tenantId: tenant.id });
			}
			if (action === 'reactivate') {
				await reactivateTenantMutation.mutateAsync({ tenantId: tenant.id });
			}
			if (action === 'delete') {
				await deleteTenantMutation.mutateAsync({ tenantId: tenant.id });
			}
		} catch (error) {
			setPendingAction(null);
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
			}
			return;
		}

		setPendingAction(null);
		await invalidateStaffTenants(queryClient);
	};

	if (!canSuspend && !canReactivate && !canDelete) {
		return (
			<span className="text-muted-foreground">
				<span aria-hidden="true">—</span>
				<span className="sr-only">{t('no-lifecycle-actions')}</span>
			</span>
		);
	}

	const dialogConfig = getConfirmDialogConfig(pendingAction, tenant.name, t);

	return (
		<div className="flex flex-col items-center gap-1">
			<DataTableRowActions
				ariaLabel={t('actions-for', { name: tenant.name })}
				testId={`staff-tenants-table-actions-${tenant.id}`}
			>
				{canReactivate ? (
					<DropdownMenuItem
						disabled={isActionPending}
						onClick={() => setPendingAction('reactivate')}
					>
						<IconRefresh />
						{t('reactivate')}
					</DropdownMenuItem>
				) : null}
				{canSuspend || canDelete ? (
					<>
						{canReactivate ? <DropdownMenuSeparator /> : null}
						{canSuspend ? (
							<DropdownMenuItem
								variant="destructive"
								disabled={isActionPending}
								onClick={() => setPendingAction('suspend')}
							>
								<IconPlayerPause />
								{t('suspend')}
							</DropdownMenuItem>
						) : null}
						{canDelete ? (
							<DropdownMenuItem
								variant="destructive"
								disabled={isActionPending}
								onClick={() => setPendingAction('delete')}
							>
								<IconTrash />
								{t('delete')}
							</DropdownMenuItem>
						) : null}
					</>
				) : null}
			</DataTableRowActions>

			<ConfirmDialog
				isOpen={pendingAction !== null}
				title={dialogConfig.title}
				description={dialogConfig.description}
				confirmLabel={dialogConfig.confirmLabel}
				isPending={isActionPending}
				onConfirm={() => {
					if (pendingAction) {
						void performAction(pendingAction);
					}
				}}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						setPendingAction(null);
					}
				}}
			/>
		</div>
	);
};
