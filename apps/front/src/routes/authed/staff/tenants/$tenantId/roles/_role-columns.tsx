import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '~/components/table/column-type';
import type { StaffTenantRoleRow } from '~/lib/query/staff-tenant-roles';
import {
	displayRoleDescription,
	displayRoleName,
} from '~/lib/roles/display-role';

import { RoleRowActions } from './_role-card';
import { deriveTenantRoleCardStyle } from './_role-card-style';
import { tenantRoleTypeChipClassName } from './_role-type-chip';

const RoleNameCell = ({
	tenantId,
	role,
	t,
}: {
	tenantId: string;
	role: StaffTenantRoleRow;
	t: (key: string, options?: Record<string, unknown>) => string;
}) => {
	const roleName = displayRoleName(role, t);
	const { Icon: RoleIcon, tone } = deriveTenantRoleCardStyle(
		role.name,
		role.icon,
		role.tone,
	);

	return (
		<Link
			to="/staff/tenants/$tenantId/roles/$roleId"
			params={{ tenantId, roleId: role.id }}
			className="flex min-w-0 items-center gap-2.5 no-underline"
		>
			<span className="publy-role-icon-tile" data-tone={tone}>
				<RoleIcon aria-hidden="true" />
			</span>
			<span className="flex min-w-0 flex-wrap items-center gap-2">
				<span
					className="publy-record-link truncate text-[13px] font-medium"
					title={roleName}
				>
					{roleName}
				</span>
				<span className={tenantRoleTypeChipClassName(role.isFullAccess)}>
					{role.isFullAccess ? t('system') : t('custom')}
				</span>
			</span>
		</Link>
	);
};

export const makeTenantRoleColumns = (
	tenantId: string,
	t: (key: string, options?: Record<string, unknown>) => string,
	onEditRequest: (role: StaffTenantRoleRow) => void,
	onDeleteRequest: (role: StaffTenantRoleRow) => void,
): ColumnDef<StaffTenantRoleRow>[] => [
	{
		id: 'name',
		header: t('role'),
		cell: ({ row }) => (
			<RoleNameCell tenantId={tenantId} role={row.original} t={t} />
		),
	},
	{
		id: 'description',
		header: t('description'),
		enableSorting: false,
		cell: ({ row }) => {
			const roleDescription = displayRoleDescription(row.original, t);

			return (
				<span
					className="block truncate text-xs text-muted-foreground"
					title={roleDescription || undefined}
				>
					{roleDescription || t('no-description-provided')}
				</span>
			);
		},
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
			<RoleRowActions
				tenantId={tenantId}
				role={row.original}
				onEditRequest={onEditRequest}
				onDeleteRequest={onDeleteRequest}
			/>
		),
	},
];
