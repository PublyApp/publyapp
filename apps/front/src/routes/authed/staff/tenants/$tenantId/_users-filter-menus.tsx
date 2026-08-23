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

import {
	formatTenantUserLevelLabel,
	formatTenantUserStatusLabel,
} from './_tenant-details-shell';
import {
	KNOWN_TENANT_USER_LEVELS,
	KNOWN_TENANT_USER_STATUSES,
	type KnownTenantUserLevel,
	type KnownTenantUserStatus,
} from './_users-list-search';

export const TenantUsersFilterMenus = ({
	selectedLevels,
	selectedStatuses,
	levelFilterLabel,
	statusFilterLabel,
	isSelectionMode,
	onSetLevels,
	onToggleLevel,
	onSetStatuses,
	onToggleStatus,
}: {
	selectedLevels: KnownTenantUserLevel[];
	selectedStatuses: KnownTenantUserStatus[];
	levelFilterLabel: string;
	statusFilterLabel: string;
	isSelectionMode: boolean;
	onSetLevels: (levels: KnownTenantUserLevel[]) => void;
	onToggleLevel: (level: KnownTenantUserLevel) => void;
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
							data-testid="staff-tenant-users-level-filter-trigger"
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
					<span className="truncate">{levelFilterLabel}</span>
					<IconChevronDown aria-hidden="true" className="size-3" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" sideOffset={6}>
					<DropdownMenuCheckboxItem
						checked={selectedLevels.length === 0}
						closeOnClick
						data-testid="staff-tenant-users-level-filter-all"
						onCheckedChange={() => onSetLevels([])}
					>
						{t('all-levels')}
					</DropdownMenuCheckboxItem>
					{KNOWN_TENANT_USER_LEVELS.map((level) => (
						<DropdownMenuCheckboxItem
							key={level}
							checked={selectedLevels.includes(level)}
							closeOnClick={false}
							showCheckbox
							data-testid={`staff-tenant-users-level-filter-${level}`}
							onCheckedChange={() => onToggleLevel(level)}
						>
							{formatTenantUserLevelLabel(level, t)}
						</DropdownMenuCheckboxItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={() => onSetLevels([])}>
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
