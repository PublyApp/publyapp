import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import type { ColumnDef } from '~/components/table/column-type';
import { DataTableRowActions } from '~/components/table/row-actions';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { BrandTile } from '~/components/ui/initials-avatar';
import { formatDateTime } from '~/lib/format-date-time';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import {
	invalidateGlobalTenantUsers,
	toGlobalTenantUserCompanyRows,
	useBulkUnlinkGlobalTenantUserCompaniesMutation,
} from '~/lib/query/staff-global-tenant-users';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { formatAccountLevelLabel } from '../staff-users/status-labels';
import { formatTenantStatusLabel } from '../tenants/$tenantId/_tenant-display';

type OrganizationRow = ReturnType<typeof toGlobalTenantUserCompanyRows>[number];

/** Column definitions and the per-row remove confirm for the global tenant-user
 * organizations tab. Lives outside the route file so it exports only its Route
 * (react-doctor rung 2, #1417); tests import the builder directly from here. */
export function buildOrganizationColumns(
	t: (key: string, options?: Record<string, unknown>) => string,
	locale: string,
	userId: string,
): ColumnDef<OrganizationRow>[] {
	return [
		{
			id: 'name',
			header: t('name'),
			accessorKey: 'name',
			meta: { width: '260px' },
			cell: ({ row }) => (
				<div className="flex min-w-0 items-center gap-2.5">
					<BrandTile name={row.original.name} logoUrl={row.original.logoUrl} />
					<span className="truncate font-medium">{row.original.name}</span>
				</div>
			),
		},
		{
			id: 'level',
			header: t('level'),
			accessorKey: 'level',
			meta: { width: '104px', hideBelow: 768 },
			cell: ({ getValue }) => (
				<span className="text-sm">
					{formatAccountLevelLabel(getValue<string | null>(), t)}
				</span>
			),
		},
		{
			id: 'status',
			header: t('status'),
			accessorKey: 'status',
			meta: { width: '140px' },
			cell: ({ getValue }) => (
				<span className="text-sm">
					{formatTenantStatusLabel(getValue<string | null>() ?? '', t)}
				</span>
			),
		},
		{
			id: 'member-since',
			header: t('member-since'),
			accessorKey: 'createdAt',
			meta: { width: '180px', hideBelow: 1024 },
			cell: ({ getValue }) => (
				<span className="text-sm text-muted-foreground">
					{formatDateTime(getValue<Date | null>(), locale)}
				</span>
			),
		},
		{
			id: 'actions',
			header: () => <span className="sr-only">{t('actions')}</span>,
			enableSorting: false,
			meta: { width: '40px', align: 'center' },
			cell: ({ row }) => (
				<DataTableRowActions
					ariaLabel={t('actions-for', { name: row.original.name })}
					testId={`tenant-user-company-actions-${row.original.id}`}
				>
					<ConfirmRemoveSingleOrganization userId={userId} row={row.original} />
				</DataTableRowActions>
			),
		},
	];
}

const ConfirmRemoveSingleOrganization = ({
	userId,
	row,
}: {
	userId: string;
	row: OrganizationRow;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [isOpen, setOpen] = useState(false);
	const bulkUnlink = useBulkUnlinkGlobalTenantUserCompaniesMutation();
	const [shouldLogout, setShouldLogout] = useState(false);

	const confirmRemoveUserFromTenant = async () => {
		try {
			await bulkUnlink.mutateAsync({ userId, tenantIds: [row.id] });
		} catch (error) {
			setOpen(false);
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}
			await displayLocalMutationFailure(error, t('an-error-occurred'));
			return;
		}
		setOpen(false);
		await invalidateGlobalTenantUsers(queryClient);
		toastLocalMutationResult.success(t('user-removed-success'));
	};

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	return (
		<ConfirmDialog
			isOpen={isOpen}
			title={t('remove-user-from-tenant')}
			description={t('confirm-remove-user-from-tenant-details')}
			confirmLabel={t('remove')}
			tone="danger"
			isPending={bulkUnlink.isPending}
			onConfirm={() => {
				void confirmRemoveUserFromTenant();
			}}
			onOpenChange={setOpen}
		/>
	);
};
