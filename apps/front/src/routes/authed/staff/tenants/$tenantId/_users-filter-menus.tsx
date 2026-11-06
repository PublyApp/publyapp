import { IconChevronDown, IconCircleDot, IconKey } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { SELECTION_LOCKED_TITLE_KEY } from '~/components/table/data-table';
import { Button } from '~/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';

import { formatTenantUserStatusLabel } from './_tenant-details-shell';
import {
	KNOWN_TENANT_USER_ROLES,
	KNOWN_TENANT_USER_STATUSES,
	type KnownTenantUserRole,
	type KnownTenantUserStatus,
} from './_users-search-params';

export const TenantUsersFilterMenus = ({
	selectedRoles,
	selectedStatuses,
	roleFilterLabel,
	statusFilterLabel,
	isSelectionMode,
	onSetRoles,
	onToggleRole,
	onSetStatuses,
	onToggleStatus,
}: {
	selectedRoles: KnownTenantUserRole[];
	selectedStatuses: KnownTenantUserStatus[];
	roleFilterLabel: string;
	statusFilterLabel: string;
	isSelectionMode: boolean;
	onSetRoles: (roles: KnownTenantUserRole[]) => void;
	onToggleRole: (role: KnownTenantUserRole) => void;
	onSetStatuses: (statuses: KnownTenantUserStatus[]) => void;
	onToggleStatus: (status: KnownTenantUserStatus) => void;
}) => {
	const { t } = useTranslation('common');

	return (
		<div className="flex items-center gap-2">
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							type="button"
							variant="outline"
							className="publy-data-table-filter-button max-w-64 text-[13px]"
							data-testid="staff-tenant-users-role-filter-trigger"
							disabled={isSelectionMode}
							title={
								isSelectionMode ? t(SELECTION_LOCKED_TITLE_KEY) : undefined
							}
						/>
					}
				>
					<IconKey
						aria-hidden="true"
						className="size-[15px] text-[var(--publy-foreground-secondary)]"
					/>
					<span className="truncate">{roleFilterLabel}</span>
					<IconChevronDown aria-hidden="true" className="size-3" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" sideOffset={6}>
					<DropdownMenuCheckboxItem
						checked={selectedRoles.length === 0}
						closeOnClick
						data-testid="staff-tenant-users-role-filter-all"
						onCheckedChange={() => onSetRoles([])}
					>
						{t('all-roles')}
					</DropdownMenuCheckboxItem>
					{KNOWN_TENANT_USER_ROLES.map((role) => (
						<DropdownMenuCheckboxItem
							key={role}
							checked={selectedRoles.includes(role)}
							closeOnClick={false}
							showCheckbox
							data-testid={`staff-tenant-users-role-filter-${role}`}
							onCheckedChange={() => onToggleRole(role)}
						>
							{role === 'full_access' ? t('full-access') : t('standard-access')}
						</DropdownMenuCheckboxItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={() => onSetRoles([])}>
						{t('clear')}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							type="button"
							variant="outline"
							className="publy-data-table-filter-button max-w-64 text-[13px]"
							data-testid="staff-tenant-users-status-filter-trigger"
							disabled={isSelectionMode}
							title={
								isSelectionMode ? t(SELECTION_LOCKED_TITLE_KEY) : undefined
							}
						/>
					}
				>
					<IconCircleDot
						aria-hidden="true"
						className="size-[15px] text-[var(--publy-foreground-secondary)]"
					/>
					<span className="truncate">{statusFilterLabel}</span>
					<IconChevronDown aria-hidden="true" className="size-3" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" sideOffset={6}>
					<DropdownMenuCheckboxItem
						checked={selectedStatuses.length === 0}
						closeOnClick
						data-testid="staff-tenant-users-status-filter-all"
						onCheckedChange={() => onSetStatuses([])}
					>
						{t('all-statuses')}
					</DropdownMenuCheckboxItem>
					{KNOWN_TENANT_USER_STATUSES.map((status) => (
						<DropdownMenuCheckboxItem
							key={status}
							checked={selectedStatuses.includes(status)}
							closeOnClick={false}
							showCheckbox
							onCheckedChange={() => onToggleStatus(status)}
						>
							{formatTenantUserStatusLabel(status, t)}
						</DropdownMenuCheckboxItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={() => onSetStatuses([])}>
						{t('clear')}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
};
