import {
	IconHash,
	IconShieldLock,
	IconStack2,
	IconUsers,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { ListColumn, ListFilter } from '~/components/list/list-types';
import { IconTile } from '~/components/ui/icon-tile';
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
		icon: IconShieldLock,
		width: 260,
		value: (row) => row.name,
		cell: (row) => {
			// Uniform shield tile (prototype's profile cell): every profile reads
			// as a permission set, not as a per-row icon choice.
			const tone = deriveProfileCardStyle(
				row.name,
				row.icon,
				row.iconTone,
			).tone;
			return (
				<Link
					to="/staff/profiles/$profileId"
					params={{ profileId: row.id }}
					className="flex min-w-0 items-center gap-2 no-underline"
				>
					<IconTile icon={IconShieldLock} size="sm" tone={tone} />
					<span
						className="publy-record-link min-w-0 truncate font-medium"
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
		// Staff profiles can never be `isDefault` (Profile.ValidateProfileType),
		// so every one of them is custom — the prototype's own data has 0
		// system profiles too.
		cell: () => (
			<StatusPill tone="neutral">{t('list-profile-type-custom')}</StatusPill>
		),
		value: () => 'custom',
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
				<span className="tabular-nums">{row.userAccountCount}</span>
			),
	},
	{
		id: 'description',
		header: t('description'),
		icon: IconHash,
		// The grid's fluid slot (1fr): the other columns keep their handoff
		// pixel widths, and a long description truncates inside the rest of
		// the card instead of stretching them (SPEC 2g).
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
				<span className="text-muted-foreground">
					{t('list-no-description')}
				</span>
			),
		sortable: false,
	},
];

/** The prototype's panel filter: Types (Système / Personnalisé). Membres stays
 * in the filter menu. Staff profiles are never system profiles, so the custom
 * value is the only one a row can carry. */
export const buildStaffProfileFilters = (
	t: Translate,
): ListFilter<StaffProfileRow>[] => [
	{
		key: 'type',
		label: t('list-types'),
		icon: IconStack2,
		panel: true,
		choices: [
			{ value: 'system', label: t('list-profile-type-system') },
			{ value: 'custom', label: t('list-profile-type-custom') },
		],
		valueOf: () => 'custom',
	},
	{
		key: 'members',
		label: t('members'),
		icon: IconUsers,
		panel: false,
		choices: [
			{ value: 'with', label: t('list-members-with') },
			{ value: 'without', label: t('list-members-without') },
		],
		valueOf: (row) => ((row.userAccountCount ?? 0) > 0 ? 'with' : 'without'),
	},
];

export const buildStaffProfileTotals = (
	t: Translate,
	totalCount: number | null | undefined,
	totalAssignments: number | null | undefined,
): Map<string, string> => {
	const totals = new Map<string, string>();
	totals.set(
		'name',
		t('list-total-staff-profiles', { count: totalCount ?? 0 }),
	);
	totals.set('type', DASH);
	totals.set(
		'members',
		t('list-total-profile-members', { count: totalAssignments ?? 0 }),
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
