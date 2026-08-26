import {
	IconBriefcase,
	IconEye,
	IconTextCaption,
	IconUsers,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTableRowActions } from '~/components/table/row-actions';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';
import { deriveProfileCardStyle } from '~/lib/profiles/profile-card-style';
import type { StaffProfileRow } from '~/lib/query/staff-profiles';

// Extracted from the list route so the route file stays component-only for
// Fast Refresh (react-doctor `only-export-components`). #980: the name cell
// renders the persisted style, falling back to deterministic derivation.
export const buildColumns = (
	t: (key: string, options?: Record<string, unknown>) => string,
): ColumnDef<StaffProfileRow>[] => [
	{
		id: 'name',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconBriefcase className="size-3.5 text-muted-foreground" />
				<span>{t('profile')}</span>
			</div>
		),
		accessorKey: 'name',
		meta: { width: '240px', pinWidthAbove: 768 },
		cell: ({ row }) => {
			const { Icon: ProfileIcon, tone } = deriveProfileCardStyle(
				row.original.name,
				row.original.icon,
				row.original.iconTone,
			);
			const name = row.original.name;
			return (
				<Link
					to="/staff/profiles/$profileId"
					params={{ profileId: row.original.id }}
					className="flex items-center gap-[11px] min-w-0 no-underline"
				>
					<span className="publy-profile-icon-tile" data-tone={tone}>
						<ProfileIcon className="size-[17px]" />
					</span>
					<span
						className="publy-record-link min-w-0 truncate text-[13px]"
						title={name || undefined}
					>
						{name || t('profile')}
					</span>
				</Link>
			);
		},
	},
	{
		id: 'description',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconTextCaption className="size-3.5 text-muted-foreground" />
				<span>{t('description')}</span>
			</div>
		),
		accessorKey: 'description',
		enableSorting: false,
		meta: { hideBelow: 768 },
		cell: ({ getValue }) => {
			const value = getValue<string | null>();
			if (!value) {
				return null;
			}
			return (
				<span className="block truncate text-[13px]" title={value}>
					{value}
				</span>
			);
		},
	},
	{
		id: 'members',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconUsers className="size-3.5 text-muted-foreground" />
				<span>{t('members')}</span>
			</div>
		),
		accessorKey: 'userAccountCount',
		enableSorting: false,
		meta: { width: '104px', hideBelow: 768 },
		cell: ({ getValue }) => {
			const value = getValue<number | null>();
			if (value === null) {
				return null;
			}
			return <span className="text-[13px] font-medium">{value}</span>;
		},
	},
	{
		id: 'actions',
		header: () => <span className="sr-only">{t('actions')}</span>,
		enableSorting: false,
		meta: { width: '40px', align: 'center' },
		cell: ({ row }) => (
			<DataTableRowActions
				ariaLabel={t('actions-for', {
					name: row.original.name || t('profile'),
				})}
				testId={`staff-profile-actions-${row.original.id}`}
			>
				<DropdownMenuItem
					render={
						<Link
							to="/staff/profiles/$profileId"
							params={{ profileId: row.original.id }}
						/>
					}
				>
					<IconEye className="size-[15px]" />
					{t('view-profile')}
				</DropdownMenuItem>
			</DataTableRowActions>
		),
	},
];
