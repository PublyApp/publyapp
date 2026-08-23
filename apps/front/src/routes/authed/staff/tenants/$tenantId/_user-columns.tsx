import {
	IconEye,
	IconPencil,
	IconRefresh,
	IconTrash,
	IconUserX,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTableRowActions } from '~/components/table/row-actions';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from '~/components/ui/dropdown-menu';
import { PersonAvatar } from '~/components/ui/person-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import {
	useReactivateStaffTenantUserMutation,
	useRemoveStaffTenantUserMutation,
	useSuspendStaffTenantUserMutation,
	type StaffTenantUserRow,
} from '~/lib/query/staff-tenant-users';
import { invalidateAllStaffTenantScopes } from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	formatTenantUserLevelLabel,
	formatTenantUserStatusLabel,
	tenantUserLevelChipClassName,
} from './_tenant-details-shell';

/**
 * Row-action menu, its confirm dialog, and column definitions for the
 * staff tenant-users table (extracted from `users.tsx` to keep that route
 * a single-component file — see the `no-multi-component-file` React Doctor
 * rule).
 */

type TenantUserPendingAction = 'suspend' | 'reactivate' | 'remove' | null;

const getNormalizedTenantUserStatus = (
	value: string | null | undefined,
): string => value?.trim().toLowerCase() ?? '';

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
				await suspendMutation.mutateAsync({ tenantId, userId: user.id });
			} else if (action === 'reactivate') {
				await reactivateMutation.mutateAsync({ tenantId, userId: user.id });
			} else {
				await removeMutation.mutateAsync({ tenantId, userId: user.id });
			}
		} catch (error) {
			// Clear the pending action on every exit path — no try/finally,
			// which the React Compiler cannot lower yet.
			setPendingAction(null);
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}
			return;
		}
		setPendingAction(null);

		await invalidateTenantUserQueries();
	};

	const dialogConfig = (() => {
		if (pendingAction === 'suspend') {
			return {
				title: t('suspend'),
				description: t('suspend-tenant-user-description'),
				confirmLabel: t('suspend'),
			};
		}
		if (pendingAction === 'reactivate') {
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
	})();

	return (
		<div className="flex flex-col items-center gap-1">
			<DataTableRowActions
				ariaLabel={t('actions-for', { name: user.displayName })}
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

export const makeTenantUserColumns = (
	tenantId: string,
	t: (key: string) => string,
	onSessionExpired: () => void,
): ColumnDef<StaffTenantUserRow>[] => [
	{
		id: 'name',
		header: t('members'),
		enableSorting: false,
		cell: ({ row }) => (
			<Link
				to="/staff/tenants/$tenantId/users/$userId"
				params={{ tenantId, userId: row.original.id }}
				className="flex min-w-0 items-center gap-2.5 no-underline"
			>
				<PersonAvatar
					name={row.original.displayName}
					avatarUrl={row.original.avatarUrl}
				/>
				<span className="min-w-0 space-y-0.5">
					<span
						className="publy-record-link block truncate text-[13px] font-medium"
						title={row.original.displayName}
					>
						{row.original.displayName}
					</span>
					<span
						className="block truncate text-xs text-muted-foreground"
						title={row.original.email}
					>
						{row.original.email}
					</span>
				</span>
			</Link>
		),
	},
	{
		id: 'level',
		header: t('level'),
		accessorKey: 'level',
		meta: { width: '150px', hideBelow: 768 },
		cell: ({ getValue }) => {
			const level = getValue<string | null>();
			return (
				<span className={tenantUserLevelChipClassName(level)}>
					{formatTenantUserLevelLabel(level, t)}
				</span>
			);
		},
	},
	{
		id: 'status',
		header: t('status'),
		accessorKey: 'status',
		meta: { width: '130px' },
		cell: ({ getValue }) => {
			const status = getValue<string | null>();
			return (
				<StatusPill tone={statusPillTone(status)}>
					{formatTenantUserStatusLabel(status, t)}
				</StatusPill>
			);
		},
	},
	{
		id: 'actions',
		header: () => <span className="sr-only">{t('actions')}</span>,
		enableSorting: false,
		meta: { width: '40px', align: 'center' },
		cell: ({ row }) => (
			<TenantUserRowActions
				tenantId={tenantId}
				user={row.original}
				onSessionExpired={onSessionExpired}
			/>
		),
	},
];
