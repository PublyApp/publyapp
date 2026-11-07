import { IconPencil } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import type { StaffTenantRoleDetails } from '~/lib/query/staff-tenant-roles';
import {
	displayRoleDescription,
	displayRoleName,
} from '~/lib/roles/display-role';

import { getRelativeTimeParts } from '../_tenant-details-shell';
import {
	deriveTenantRoleCardStyle,
	tenantRoleTypeChipClassName,
} from '../roles';

export const RoleIdentityHeader = ({
	role,
	permissionCount,
	onEdit,
}: {
	role: StaffTenantRoleDetails;
	permissionCount: number;
	onEdit: () => void;
}) => {
	const { t } = useTranslation(['staff-tenant-roles', 'common']);
	const roleName = displayRoleName(role, t);
	const roleDescription = displayRoleDescription(role, t);
	const { Icon: RoleIcon, tone: roleTone } = deriveTenantRoleCardStyle(
		role.name,
		role.icon,
		role.tone,
	);
	const updatedRelativeParts = getRelativeTimeParts(role.updatedAt);

	return (
		<header
			className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
			data-testid="staff-tenant-role-identity"
		>
			<div className="flex min-w-0 items-start gap-4">
				<span className="publy-role-detail-tile" data-tone={roleTone}>
					<RoleIcon aria-hidden="true" />
				</span>
				<div className="min-w-0 space-y-1.5">
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="text-2xl font-semibold text-foreground">
							{roleName}
						</h1>
						<span className={tenantRoleTypeChipClassName(role.isFullAccess)}>
							{role.isFullAccess ? t('system-role') : t('custom-role')}
						</span>
					</div>
					<p className="max-w-3xl text-sm text-muted-foreground">
						{roleDescription ?? t('common:no-description-provided')}
					</p>
					<p className="text-xs text-muted-foreground">
						{t('common:tenant-member-count', {
							count: role.userAccountCount,
						})}
						{' · '}
						{role.isFullAccess
							? t('common:full-access')
							: t('common:tenant-permission-count', {
									count: permissionCount,
								})}
						{updatedRelativeParts ? (
							<>
								{' · '}
								{t('role-updated-relative', {
									time: t(updatedRelativeParts.key, {
										count: updatedRelativeParts.count,
										ns: 'common',
									}),
								})}
							</>
						) : null}
					</p>
				</div>
			</div>

			{role.isFullAccess ? null : (
				<Button type="button" variant="outline" size="sm" onClick={onEdit}>
					<IconPencil aria-hidden="true" className="size-4" />
					{t('common:edit')}
				</Button>
			)}
		</header>
	);
};
