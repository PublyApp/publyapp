import {
	IconBriefcase,
	IconStack2,
	IconTextCaption,
	IconUsers,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { ListColumn, ListFilter } from '~/components/list/list-types';
import { StatusPill } from '~/components/ui/product-page';
import { deriveProfileCardStyle } from '~/lib/profiles/profile-card-style';
import type { StaffProfileRow } from '~/lib/query/staff-profiles';
import { buildCsv } from '~/utils/csv';
import { downloadFile, formatExportDateStamp } from '~/utils/download-file';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const DASH = '—';
const Dash = () => <span className="text-muted-foreground">{DASH}</span>;

export const DEFAULT_STAFF_PROFILE_COLUMNS = [
	'name',
	'type',
	'members',
	'description',
] as const;

export const staffProfileColumns = (
	t: Translate,
): ListColumn<StaffProfileRow>[] => [
	{
		id: 'name',
		header: t('profile'),
		icon: IconBriefcase,
		width: 260,
		value: (row) => row.name,
		cell: (row) => {
			const { Icon: ProfileIcon, tone } = deriveProfileCardStyle(
				row.name,
				row.icon,
				row.iconTone,
			);
			return (
				<Link
					to="/staff/profiles/$profileId"
					params={{ profileId: row.id }}
					className="flex min-w-0 items-center gap-[11px] no-underline"
				>
					<span className="publy-profile-icon-tile" data-tone={tone}>
						<ProfileIcon className="size-[17px]" />
					</span>
					<span
						className="publy-record-link min-w-0 truncate text-[13px]"
						title={row.name}
					>
						{row.name}
					</span>
				</Link>
			);
		},
	},
	{
		id: 'type',
		header: t('list-column-type'),
		icon: IconStack2,
		width: 140,
		// No `isDefault`/system flag on StaffProfileItem: the design's
		// Système/Personnalisé split cannot be computed, so it is a dash.
		cell: Dash,
		sortable: false,
	},
	{
		id: 'members',
		header: t('members'),
		icon: IconUsers,
		width: 120,
		value: (row) => row.userAccountCount,
		cell: (row) =>
			row.userAccountCount === null ? (
				<Dash />
			) : (
				<span className="font-medium tabular-nums">{row.userAccountCount}</span>
			),
	},
	{
		id: 'description',
		header: t('description'),
		icon: IconTextCaption,
		width: 380,
		value: (row) => row.description,
		cell: (row) =>
			row.description ? (
				<span
					className="block truncate text-muted-foreground"
					title={row.description}
				>
					{row.description}
				</span>
			) : (
				<Dash />
			),
		sortable: false,
	},
];

/** The only §4.6 profile filter the list DTO can answer: at least one member vs
 * none. The Types filter is omitted — no system/custom field exists (#2281). */
export const buildStaffProfileFilters = (
	t: Translate,
): ListFilter<StaffProfileRow>[] => [
	{
		key: 'members',
		label: t('members'),
		icon: IconUsers,
		panel: true,
		choices: [
			{ value: 'with', label: t('list-members-with') },
			{ value: 'without', label: t('list-members-without') },
		],
		valueOf: (row) => ((row.userAccountCount ?? 0) > 0 ? 'with' : 'without'),
	},
];

export const buildStaffProfileTotals = (
	t: Translate,
	rows: StaffProfileRow[],
): Map<string, string> => {
	let assignments = 0;
	for (const row of rows) {
		assignments += row.userAccountCount ?? 0;
	}
	const totals = new Map<string, string>();
	totals.set('name', t('list-total-staff-profiles', { count: rows.length }));
	totals.set('type', DASH);
	totals.set(
		'members',
		t('list-total-profile-members', { count: assignments }),
	);
	totals.set('description', DASH);
	return totals;
};

export const buildStaffProfileMobileCard =
	(t: Translate) => (row: StaffProfileRow) => ({
		code: t('profile'),
		badges: (
			<StatusPill tone="neutral">
				{row.userAccountCount ?? DASH} {t('members')}
			</StatusPill>
		),
		end: row.userAccountCount ?? DASH,
		title: row.name,
		sub: row.description ?? DASH,
		foot: [t('members'), row.userAccountCount ?? DASH] as [
			string,
			number | string,
		],
	});

export const exportStaffProfileRows = (
	rows: StaffProfileRow[],
	t: Translate,
): void => {
	const columns = staffProfileColumns(t);
	const csv = buildCsv([
		columns.map((column) => column.header),
		...rows.map((row) =>
			columns.map((column) => {
				const value = column.value?.(row) ?? '';
				return value === null ? '' : String(value);
			}),
		),
	]);
	downloadFile({
		data: csv,
		fileName: `staff-profiles-${formatExportDateStamp(new Date())}.csv`,
		mimeType: 'text/csv;charset=utf-8',
	});
};
