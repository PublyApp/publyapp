import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '~/components/table/column-type';
import { PersonAvatar } from '~/components/ui/person-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import type { StaffTenantProfileMemberRow } from '~/lib/query/staff-tenant-profiles';

import {
	formatMonthYear,
	formatTenantUserLevelLabel,
	formatTenantUserStatusLabel,
	tenantUserLevelChipClassName,
} from '../_tenant-details-shell';

const VISIBLE_OTHER_PROFILE_CHIP_COUNT = 2;

export const makeProfileMemberColumns = (
	tenantId: string,
	t: (key: string, options?: Record<string, unknown>) => string,
	locale: string,
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
		id: 'otherProfiles',
		header: t('staff-tenant-profiles:other-profiles'),
		enableSorting: false,
		meta: { width: '250px', hideBelow: 1024 },
		cell: ({ row }) => {
			const otherProfiles = row.original.otherProfiles;
			if (otherProfiles.length === 0) {
				return (
					<span className="text-xs text-muted-foreground">
						{t('staff-tenant-profiles:no-other-profiles')}
					</span>
				);
			}

			const visibleProfiles = otherProfiles.slice(
				0,
				VISIBLE_OTHER_PROFILE_CHIP_COUNT,
			);
			const overflowProfiles = otherProfiles.slice(
				VISIBLE_OTHER_PROFILE_CHIP_COUNT,
			);

			return (
				<div className="flex min-w-0 items-center gap-1">
					{visibleProfiles.map((profile) => (
						<span
							key={profile.id}
							className="publy-detail-chip publy-detail-chip--outline max-w-24 truncate"
							title={profile.name}
						>
							{profile.name}
						</span>
					))}
					{overflowProfiles.length > 0 ? (
						<span
							className="publy-detail-chip publy-detail-chip--outline"
							title={overflowProfiles.map((profile) => profile.name).join(', ')}
						>
							+{overflowProfiles.length}
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
		header: t('staff-tenant-profiles:joined'),
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
