import { IconChevronDown, IconCircleDot, IconKey } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
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
	type KnownInvitationStatus,
	KNOWN_INVITATION_STATUSES,
} from '../../invitations/list-helpers';
import { formatTenantInvitationStatusLabel } from './_invitation-columns';
import { formatTenantUserLevelLabel } from './_tenant-details-shell';

const KNOWN_INVITATION_ACCOUNT_LEVELS = ['admin', 'user'] as const;
type KnownLevel = (typeof KNOWN_INVITATION_ACCOUNT_LEVELS)[number];

type ToolbarFiltersProps = {
	selectedLevels: KnownLevel[];
	selectedStatuses: KnownInvitationStatus[];
	levelFilterLabel: string;
	statusFilterLabel: string;
	onSetLevels: (next: KnownLevel[]) => void;
	onToggleLevel: (level: KnownLevel) => void;
	onSetStatuses: (next: KnownInvitationStatus[]) => void;
	onToggleStatus: (status: KnownInvitationStatus) => void;
};

/** Status / account-level dropdown pair rendered at the far end of the
 * invitations table toolbar. Extracted so each render unit stays
 * reviewable in isolation. */
export function InvitationToolbarFilters({
	selectedLevels,
	selectedStatuses,
	levelFilterLabel,
	statusFilterLabel,
	onSetLevels,
	onToggleLevel,
	onSetStatuses,
	onToggleStatus,
}: ToolbarFiltersProps) {
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
							data-testid="staff-tenant-invitations-level-filter-trigger"
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
						data-testid="staff-tenant-invitations-level-filter-all"
						onCheckedChange={() => onSetLevels([])}
					>
						{t('all-account-levels')}
					</DropdownMenuCheckboxItem>
					{KNOWN_INVITATION_ACCOUNT_LEVELS.map((level) => (
						<DropdownMenuCheckboxItem
							key={level}
							checked={selectedLevels.includes(level)}
							closeOnClick={false}
							showCheckbox
							data-testid={`staff-tenant-invitations-level-filter-${level}`}
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
							data-testid="staff-tenant-invitations-status-filter-trigger"
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
						onCheckedChange={() => onSetStatuses([])}
					>
						{t('all-statuses')}
					</DropdownMenuCheckboxItem>
					{KNOWN_INVITATION_STATUSES.map((status) => (
						<DropdownMenuCheckboxItem
							key={status}
							checked={selectedStatuses.includes(status)}
							closeOnClick={false}
							showCheckbox
							data-testid={`staff-tenant-invitations-status-filter-${status}`}
							onCheckedChange={() => onToggleStatus(status)}
						>
							{formatTenantInvitationStatusLabel(status, t)}
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
}
