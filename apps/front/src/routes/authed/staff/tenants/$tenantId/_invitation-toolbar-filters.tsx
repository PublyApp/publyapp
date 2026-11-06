import { IconChevronDown, IconCircleDot } from '@tabler/icons-react';
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
	type KnownInvitationStatus,
	KNOWN_INVITATION_STATUSES,
} from '../../invitations/list-helpers';
import { formatTenantInvitationStatusLabel } from './_invitation-columns';

type ToolbarFiltersProps = {
	selectedStatuses: KnownInvitationStatus[];
	statusFilterLabel: string;
	onSetStatuses: (next: KnownInvitationStatus[]) => void;
	onToggleStatus: (status: KnownInvitationStatus) => void;
	/** #838: while row-selection mode is active the filter triggers are
	 * disabled with the shared locked-title tooltip so a pending selection
	 * cannot be invalidated by a filter change. */
	selectionLocked?: boolean;
};

/** Status filter rendered at the far end of the invitations table toolbar. Extracted so each render unit stays
 * reviewable in isolation. */
export const InvitationToolbarFilters = ({
	selectedStatuses,
	statusFilterLabel,
	onSetStatuses,
	onToggleStatus,
	selectionLocked = false,
}: ToolbarFiltersProps) => {
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
							data-testid="staff-tenant-invitations-status-filter-trigger"
							disabled={selectionLocked}
							title={
								selectionLocked ? t(SELECTION_LOCKED_TITLE_KEY) : undefined
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
};
