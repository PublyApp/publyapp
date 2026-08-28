import { Link } from '@tanstack/react-router';
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy';
import type { StaffTenantProfileRow } from '~/lib/query/staff-tenant-profiles';

import { ProfileRowActions } from './_profile-card';
import { deriveTenantProfileCardStyle } from './_profile-card-style';
import { tenantProfileTypeChipClassName } from './_profile-type-chip';

const ProfileNameCell = ({
	tenantId,
	profile,
	t,
}: {
	tenantId: string;
	profile: StaffTenantProfileRow;
	t: (key: string, options?: Record<string, unknown>) => string;
}) => {
	const { Icon: ProfileIcon, tone } = deriveTenantProfileCardStyle(
		profile.name,
		profile.icon,
		profile.tone,
	);

	return (
		<Link
			to="/staff/tenants/$tenantId/profiles/$profileId"
			params={{ tenantId, profileId: profile.id }}
			className="flex min-w-0 items-center gap-2.5 no-underline"
		>
			<span className="publy-profile-icon-tile" data-tone={tone}>
				<ProfileIcon aria-hidden="true" />
			</span>
			<span className="flex min-w-0 flex-wrap items-center gap-2">
				<span
					className="publy-record-link truncate text-[13px] font-medium"
					title={profile.name}
				>
					{profile.name}
				</span>
				<span className={tenantProfileTypeChipClassName(profile.isDefault)}>
					{profile.isDefault ? t('system') : t('custom')}
				</span>
			</span>
		</Link>
	);
};

export const makeTenantProfileColumns = (
	tenantId: string,
	t: (key: string, options?: Record<string, unknown>) => string,
	onEditRequest: (profile: StaffTenantProfileRow) => void,
	onDeleteRequest: (profile: StaffTenantProfileRow) => void,
): ColumnDef<StaffTenantProfileRow>[] => [
	{
		id: 'name',
		header: t('profile'),
		cell: ({ row }) => (
			<ProfileNameCell tenantId={tenantId} profile={row.original} t={t} />
		),
	},
	{
		id: 'description',
		header: t('description'),
		enableSorting: false,
		cell: ({ row }) => (
			<span
				className="block truncate text-xs text-muted-foreground"
				title={row.original.description || undefined}
			>
				{row.original.description || t('no-description-provided')}
			</span>
		),
	},
	{
		id: 'members',
		header: t('members'),
		accessorKey: 'userAccountCount',
		enableSorting: false,
		meta: { width: '110px' },
		cell: ({ getValue }) => (
			<span className="text-[13px] text-foreground">{getValue<number>()}</span>
		),
	},
	{
		id: 'permissions',
		header: t('permissions'),
		accessorKey: 'permissionsCount',
		enableSorting: false,
		meta: { width: '120px' },
		cell: ({ getValue }) => (
			<span className="text-[13px] text-foreground">{getValue<number>()}</span>
		),
	},
	{
		id: 'actions',
		header: () => <span className="sr-only">{t('actions')}</span>,
		enableSorting: false,
		meta: { width: '40px', align: 'center' },
		cell: ({ row }) => (
			<ProfileRowActions
				tenantId={tenantId}
				profile={row.original}
				onEditRequest={onEditRequest}
				onDeleteRequest={onDeleteRequest}
			/>
		),
	},
];
