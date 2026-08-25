import {
	IconChevronDown,
	IconFilter,
	IconLayoutGrid,
	IconTable,
} from '@tabler/icons-react';
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
import { cn } from '~/lib/utils';

import type {
	StaffTenantProfilesViewMode,
	StaffTenantProfileTypeFilter,
} from './_profiles-search-params';

export const ProfileViewToggle = ({
	view,
	onChange,
	testId,
}: {
	view: StaffTenantProfilesViewMode;
	onChange: (next: StaffTenantProfilesViewMode) => void;
	testId: string;
}) => {
	const { t } = useTranslation('common');

	return (
		<div
			className="publy-data-table-view-toggle border border-border bg-background p-0.5"
			role="group"
			aria-label={t('view-toggle-aria-label')}
		>
			<button
				type="button"
				className={cn(
					'publy-data-table-view-toggle-item flex size-8 items-center justify-center',
					view === 'cards'
						? 'bg-muted text-foreground'
						: 'text-muted-foreground',
				)}
				aria-pressed={view === 'cards'}
				aria-label={t('cards-view')}
				data-testid={`${testId}-view-toggle-cards`}
				onClick={() => onChange('cards')}
			>
				<IconLayoutGrid className="size-4" />
			</button>
			<button
				type="button"
				className={cn(
					'publy-data-table-view-toggle-item flex size-8 items-center justify-center',
					view === 'table'
						? 'bg-muted text-foreground'
						: 'text-muted-foreground',
				)}
				aria-pressed={view === 'table'}
				aria-label={t('table-view')}
				data-testid={`${testId}-view-toggle-table`}
				onClick={() => onChange('table')}
			>
				<IconTable className="size-4" />
			</button>
		</div>
	);
};

const formatProfileTypeFilterLabel = (
	value: StaffTenantProfileTypeFilter | undefined,
	t: (key: string) => string,
): string => {
	if (value === 'true') {
		return t('system');
	}

	if (value === 'false') {
		return t('custom');
	}

	return t('all-types');
};

export const ProfileTypeFilter = ({
	value,
	onChange,
	testId,
	disabled,
}: {
	value: StaffTenantProfileTypeFilter | undefined;
	onChange: (next: StaffTenantProfileTypeFilter | undefined) => void;
	testId: string;
	disabled?: boolean;
}) => {
	const { t } = useTranslation('common');
	const label = formatProfileTypeFilterLabel(value, t);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						type="button"
						variant="outline"
						className="publy-data-table-filter-button max-w-64 text-[13px]"
						data-testid={`${testId}-type-filter-trigger`}
						disabled={disabled}
						title={disabled ? t(SELECTION_LOCKED_TITLE_KEY) : undefined}
					/>
				}
			>
				<IconFilter
					aria-hidden="true"
					className="size-[15px] text-[var(--publy-foreground-secondary)]"
				/>
				<span className="truncate">{label}</span>
				<IconChevronDown aria-hidden="true" className="size-3" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" sideOffset={6}>
				<DropdownMenuCheckboxItem
					checked={value === undefined}
					closeOnClick
					data-testid={`${testId}-type-filter-all`}
					onCheckedChange={() => onChange(undefined)}
				>
					{t('all-types')}
				</DropdownMenuCheckboxItem>
				<DropdownMenuCheckboxItem
					checked={value === 'true'}
					closeOnClick
					data-testid={`${testId}-type-filter-system`}
					onCheckedChange={() => onChange('true')}
				>
					{t('system')}
				</DropdownMenuCheckboxItem>
				<DropdownMenuCheckboxItem
					checked={value === 'false'}
					closeOnClick
					data-testid={`${testId}-type-filter-custom`}
					onCheckedChange={() => onChange('false')}
				>
					{t('custom')}
				</DropdownMenuCheckboxItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={() => onChange(undefined)}>
					{t('clear')}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
