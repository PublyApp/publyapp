import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { InitialsAvatar } from '~/components/ui/initials-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import type { StaffTenantProfileMemberRow } from '~/lib/query/staff-tenant-profiles';

import {
	formatTenantUserLevelLabel,
	formatTenantUserStatusLabel,
	tenantUserLevelChipClassName,
} from '../_tenant-details-shell';

export const makeProfileMemberColumns = (
	tenantId: string,
	t: (key: string, options?: Record<string, unknown>) => string,
): ColumnDef<StaffTenantProfileMemberRow>[] => [
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
				<InitialsAvatar name={row.original.displayName} />
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
];
