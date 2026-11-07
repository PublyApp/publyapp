import { IconEye, IconPencil, IconTrash } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { DataTableRowActions } from '~/components/table/row-actions';
import { Card } from '~/components/ui/card';
import { Checkbox } from '~/components/ui/checkbox';
import { EntityHeaderSkeleton } from '~/components/ui/detail-skeleton';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';
import type { StaffTenantRoleRow } from '~/lib/query/staff-tenant-roles';
import {
	displayRoleDescription,
	displayRoleName,
} from '~/lib/roles/display-role';
import { cn } from '~/lib/utils';

import { deriveTenantRoleCardStyle } from './_role-card-style';
import { tenantRoleTypeChipClassName } from './_role-type-chip';

export const RoleCardGridSkeleton = ({ testId }: { testId: string }) => (
	<div className="publy-role-card-grid" data-testid={`${testId}-loading`}>
		{['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5', 'sk-6'].map((key) => (
			<Card key={key} className="flex flex-col gap-3 p-4">
				<EntityHeaderSkeleton
					orientation="stacked"
					tileClassName="size-10 rounded-[10px]"
					lines={['h-3 w-2/3', 'h-3 w-full', 'h-3 w-1/3']}
				/>
			</Card>
		))}
	</div>
);

export const RoleRowActions = ({
	tenantId,
	role,
	onEditRequest,
	onDeleteRequest,
}: {
	tenantId: string;
	role: StaffTenantRoleRow;
	onEditRequest: (role: StaffTenantRoleRow) => void;
	onDeleteRequest: (role: StaffTenantRoleRow) => void;
}) => {
	const { t } = useTranslation('common');
	const roleName = displayRoleName(role, t);

	return (
		<DataTableRowActions
			ariaLabel={t('actions-for', { name: roleName || t('role') })}
			testId={`staff-tenant-role-actions-${role.id}`}
		>
			<DropdownMenuItem
				render={
					<Link
						to="/staff/tenants/$tenantId/roles/$roleId"
						params={{ tenantId, roleId: role.id }}
					/>
				}
			>
				<IconEye className="size-[15px]" />
				{t('view-details')}
			</DropdownMenuItem>
			{/* #972: NOT a <Link> to `.../$roleId/edit`. That route is a frozen
			 * redirect stub kept only for old bookmarks, so linking to it cost a
			 * full navigation to the detail page and threw away this list's
			 * filters, cursor page, selection and scroll. Editing is a list-local
			 * search-state change (`?edit=<roleId>`) that opens the same drawer
			 * over the list. */}
			{role.isFullAccess ? null : (
				<DropdownMenuItem
					data-testid={`staff-tenant-role-edit-${role.id}`}
					onClick={() => onEditRequest(role)}
				>
					<IconPencil className="size-[15px]" />
					{t('edit')}
				</DropdownMenuItem>
			)}
			{role.isFullAccess ? null : (
				<DropdownMenuItem
					variant="destructive"
					disabled={role.isDefault}
					title={role.isDefault ? t('default-role-delete-disabled') : undefined}
					data-testid={`staff-tenant-role-delete-${role.id}`}
					onClick={() => onDeleteRequest(role)}
				>
					<IconTrash className="size-[15px]" />
					{t('delete')}
				</DropdownMenuItem>
			)}
		</DataTableRowActions>
	);
};

export const RoleCard = ({
	tenantId,
	role,
	onEditRequest,
	onDeleteRequest,
	isSelected,
	isSelectionMode,
	onToggleSelect,
}: {
	tenantId: string;
	role: StaffTenantRoleRow;
	onEditRequest: (role: StaffTenantRoleRow) => void;
	onDeleteRequest: (role: StaffTenantRoleRow) => void;
	isSelected: boolean;
	isSelectionMode: boolean;
	onToggleSelect: (roleId: string) => void;
}) => {
	const { t } = useTranslation('common');
	const roleName = displayRoleName(role, t);
	const roleDescription = displayRoleDescription(role, t);
	const { Icon: RoleIcon, tone } = deriveTenantRoleCardStyle(
		role.name,
		role.icon,
		role.tone,
	);

	return (
		<Card
			className={cn(
				'group/role-card relative flex min-w-0 flex-row items-start gap-3 overflow-hidden p-4',
				isSelected && 'publy-role-card--selected',
			)}
			data-testid={`staff-tenant-role-card-${role.id}`}
		>
			<span
				className={cn(
					'absolute left-3 top-3 z-(--publy-z-raised) flex size-4 shrink-0 items-center justify-center rounded-[7px] bg-background transition-opacity',
					isSelectionMode
						? 'opacity-100'
						: 'opacity-0 group-hover/role-card:opacity-100 focus-within:opacity-100',
				)}
			>
				<Checkbox
					checked={isSelected}
					onCheckedChange={() => onToggleSelect(role.id)}
					aria-label={t('select-role-checkbox-label', {
						name: roleName || t('role'),
					})}
					data-testid={`staff-tenant-role-card-select-${role.id}`}
				/>
			</span>

			<Link
				to="/staff/tenants/$tenantId/roles/$roleId"
				params={{ tenantId, roleId: role.id }}
				className="shrink-0 no-underline"
			>
				<span
					className="publy-role-icon-tile publy-role-icon-tile--lg"
					data-tone={tone}
				>
					<RoleIcon aria-hidden="true" />
				</span>
			</Link>

			<div className="min-w-0 flex-1 space-y-1 pr-7">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<Link
						to="/staff/tenants/$tenantId/roles/$roleId"
						params={{ tenantId, roleId: role.id }}
						className="publy-record-link min-w-0 truncate text-[14px] font-semibold text-foreground no-underline"
						title={roleName}
					>
						{roleName}
					</Link>
					<span className={tenantRoleTypeChipClassName(role.isFullAccess)}>
						{role.isFullAccess ? t('system') : t('custom')}
					</span>
				</div>
				<p
					className="truncate text-xs text-muted-foreground"
					title={roleDescription || undefined}
				>
					{roleDescription || t('no-description-provided')}
				</p>
				<p className="text-[11px] text-muted-foreground">
					{t('tenant-member-count', { count: role.userAccountCount })}
					{' · '}
					{t('tenant-permission-count', { count: role.permissionsCount })}
				</p>
			</div>

			<div className="absolute right-3 top-3">
				<RoleRowActions
					tenantId={tenantId}
					role={role}
					onEditRequest={onEditRequest}
					onDeleteRequest={onDeleteRequest}
				/>
			</div>
		</Card>
	);
};
