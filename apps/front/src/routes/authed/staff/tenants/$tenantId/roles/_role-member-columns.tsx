import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '~/components/table/column-type';
import { PersonAvatar } from '~/components/ui/person-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import type { StaffTenantRoleMemberRow } from '~/lib/query/staff-tenant-roles';

import {
	formatMonthYear,
	formatTenantUserAccessLabel,
	formatTenantUserStatusLabel,
	tenantUserAccessChipClassName,
} from '../_tenant-details-shell';

const VISIBLE_OTHER_ROLE_CHIP_COUNT = 2;

export const makeRoleMemberColumns = (
	tenantId: string,
	t: (key: string, options?: Record<string, unknown>) => string,
	locale: string,
): ColumnDef<StaffTenantRoleMemberRow>[] => [
	{
		id: 'name',
		header: t('members'),
		enableSorting: false,
		cell: ({ row }) => (
			<Link
				to="/staff/tenants/$tenantId/users/$userId"
				params={{ tenantId, userId: row.original.userId }}
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
		id: 'is_full_access',
		header: t('role'),
		accessorKey: 'isFullAccess',
		meta: { width: '150px', hideBelow: 768 },
		cell: ({ getValue }) => {
			const isFullAccess = getValue<boolean>();
			return (
				<span className={tenantUserAccessChipClassName(isFullAccess)}>
					{formatTenantUserAccessLabel(isFullAccess, t)}
				</span>
			);
		},
	},
	{
		id: 'otherRoles',
		header: t('staff-tenant-roles:other-roles'),
		enableSorting: false,
		meta: { width: '250px', hideBelow: 1024 },
		cell: ({ row }) => {
			const otherRoles = row.original.otherRoles;
			if (otherRoles.length === 0) {
				return (
					<span className="text-xs text-muted-foreground">
						{t('staff-tenant-roles:no-other-roles')}
					</span>
				);
			}

			const visibleRoles = otherRoles.slice(0, VISIBLE_OTHER_ROLE_CHIP_COUNT);
			const overflowRoles = otherRoles.slice(VISIBLE_OTHER_ROLE_CHIP_COUNT);

			return (
				<div className="flex min-w-0 items-center gap-1">
					{visibleRoles.map((role) => (
						<span
							key={role.id}
							className="publy-detail-chip publy-detail-chip--outline max-w-24 truncate"
							title={role.name}
						>
							{role.name}
						</span>
					))}
					{overflowRoles.length > 0 ? (
						<span
							className="publy-detail-chip publy-detail-chip--outline"
							title={overflowRoles.map((role) => role.name).join(', ')}
						>
							+{overflowRoles.length}
						</span>
					) : null}
				</div>
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
		id: 'joinedAt',
		header: t('staff-tenant-roles:joined'),
		accessorKey: 'joinedAt',
		enableSorting: false,
		meta: { width: '120px', hideBelow: 768 },
		cell: ({ getValue }) => (
			<span className="text-xs text-muted-foreground">
				{formatMonthYear(getValue<Date | null>(), locale)}
			</span>
		),
	},
];
