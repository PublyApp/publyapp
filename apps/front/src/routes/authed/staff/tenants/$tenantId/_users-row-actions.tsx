import {
	IconEye,
	IconPencil,
	IconRefresh,
	IconTrash,
	IconUserX,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTableRowActions } from '~/components/table/row-actions';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from '~/components/ui/dropdown-menu';
import {
	useReactivateStaffTenantUserMutation,
	useRemoveStaffTenantUserMutation,
	useSuspendStaffTenantUserMutation,
	type StaffTenantUserRow,
} from '~/lib/query/staff-tenant-users';
import { invalidateAllStaffTenantScopes } from '~/lib/query/staff-tenants';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

type TenantUserPendingAction = 'suspend' | 'reactivate' | 'remove' | null;

const getNormalizedTenantUserStatus = (
	value: string | null | undefined,
): string => value?.trim().toLowerCase() ?? '';

// Extracted from an IIFE for publy/no-iife (#1310): plain helper over the
// pending action, called during render.
type TenantUserActionDialogCopy = {
	title: string;
	description: string;
	confirmLabel: string;
};

const getTenantUserActionDialogCopy = (
	action: TenantUserPendingAction,
	t: (key: string) => string,
): TenantUserActionDialogCopy => {
	if (action === 'suspend') {
		return {
			title: t('suspend'),
			description: t('suspend-tenant-user-description'),
			confirmLabel: t('suspend'),
		};
	}
	if (action === 'reactivate') {
		return {
			title: t('reactivate'),
			description: t('reactivate-tenant-user-description'),
			confirmLabel: t('reactivate'),
		};
	}
	return {
		title: t('remove-user-from-tenant'),
		description: t('confirm-remove-user-from-tenant-details'),
		confirmLabel: t('remove-user-from-tenant'),
	};
};

export const TenantUserRowActions = ({
	tenantId,
	user,
	onSessionExpired,
}: {
	tenantId: string;
	user: StaffTenantUserRow;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [pendingAction, setPendingAction] =
		useState<TenantUserPendingAction>(null);
	const suspendMutation = useSuspendStaffTenantUserMutation();
	const reactivateMutation = useReactivateStaffTenantUserMutation();
	const removeMutation = useRemoveStaffTenantUserMutation();

	const normalizedStatus = getNormalizedTenantUserStatus(user.status);
	const canSuspend = normalizedStatus === 'active';
	const canReactivate = normalizedStatus === 'suspended';
	const isActionPending =
		suspendMutation.isPending ||
		reactivateMutation.isPending ||
		removeMutation.isPending;

	const invalidateTenantUserQueries = () =>
		invalidateAllStaffTenantScopes(queryClient);

	const performAction = async (action: 'suspend' | 'reactivate' | 'remove') => {
		try {
			if (action === 'suspend') {
				await suspendMutation.mutateAsync({
					tenantId,
					userId: user.id,
				});
			} else if (action === 'reactivate') {
				await reactivateMutation.mutateAsync({
					tenantId,
					userId: user.id,
				});
			} else {
				await removeMutation.mutateAsync({
					tenantId,
					userId: user.id,
				});
			}
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}
			return;
		} finally {
			setPendingAction(null);
		}

		await invalidateTenantUserQueries();
	};

	const dialogConfig = getTenantUserActionDialogCopy(pendingAction, t);

	return (
		<div className="flex flex-col items-center gap-1">
			<DataTableRowActions
				ariaLabel={t('actions-for', {
					name: user.displayName,
				})}
				testId={`staff-tenant-user-actions-${user.id}`}
			>
				<DropdownMenuItem
					render={
						<Link
							to="/staff/tenants/$tenantId/users/$userId"
							params={{ tenantId, userId: user.id }}
						/>
					}
				>
					<IconEye className="size-[15px]" />
					{t('view-details')}
				</DropdownMenuItem>
				<DropdownMenuItem
					render={
						<Link
							to="/staff/tenants/$tenantId/users/$userId/edit"
							params={{ tenantId, userId: user.id }}
						/>
					}
				>
					<IconPencil className="size-[15px]" />
					{t('edit')}
				</DropdownMenuItem>
				{canReactivate ? (
					<DropdownMenuItem
						disabled={isActionPending}
						onClick={() => setPendingAction('reactivate')}
					>
						<IconRefresh className="size-[15px]" />
						{t('reactivate')}
					</DropdownMenuItem>
				) : null}
				{canSuspend ? (
					<DropdownMenuItem
						variant="destructive"
						disabled={isActionPending}
						onClick={() => setPendingAction('suspend')}
					>
						<IconUserX className="size-[15px]" />
						{t('suspend')}
					</DropdownMenuItem>
				) : null}
				<DropdownMenuSeparator />
				<DropdownMenuItem
					variant="destructive"
					disabled={isActionPending}
					onClick={() => setPendingAction('remove')}
				>
					<IconTrash className="size-[15px]" />
					{t('remove-user-from-tenant')}
				</DropdownMenuItem>
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
					if (!isOpen) setPendingAction(null);
				}}
			/>
		</div>
	);
};
