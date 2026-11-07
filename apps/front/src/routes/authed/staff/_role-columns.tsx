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
import type { StaffRoleRow } from '~/lib/query/staff-roles';
import { deriveRoleCardStyle } from '~/lib/roles/role-card-style';
import { buildCsv } from '~/utils/csv';
import { downloadFile, formatExportDateStamp } from '~/utils/download-file';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const DASH = '—';
const Dash = () => <span className="text-muted-foreground">{DASH}</span>;

export const DEFAULT_STAFF_ROLE_COLUMNS = [
	'name',
	'type',
	'members',
	'description',
] as const;

export const staffRoleColumns = (t: Translate): ListColumn<StaffRoleRow>[] => [
	{
		id: 'name',
		header: t('role'),
		icon: IconShieldLock,
		width: 260,
		value: (row) => row.name,
		cell: (row) => {
			// Uniform shield tile (prototype's role cell): every role reads
			// as a permission set, not as a per-row icon choice.
			const tone = deriveRoleCardStyle(row.name, row.icon, row.iconTone).tone;
			return (
				<Link
					to="/staff/roles/$roleId"
					params={{ roleId: row.id }}
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
		// The seeded full-access role is the only system role; every other
		// staff role is custom.
		cell: (row) => (
			<StatusPill tone={row.isFullAccess ? 'primary' : 'neutral'}>
				{row.isFullAccess
					? t('list-role-type-system')
					: t('list-role-type-custom')}
			</StatusPill>
		),
		value: (row) => (row.isFullAccess ? 'system' : 'custom'),
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
 * in the filter menu. */
export const buildStaffRoleFilters = (
	t: Translate,
): ListFilter<StaffRoleRow>[] => [
	{
		key: 'type',
		label: t('list-types'),
		icon: IconStack2,
		panel: true,
		choices: [
			{ value: 'system', label: t('list-role-type-system') },
			{ value: 'custom', label: t('list-role-type-custom') },
		],
		valueOf: (row) => (row.isFullAccess ? 'system' : 'custom'),
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

export const buildStaffRoleTotals = (
	t: Translate,
	totalCount: number | null | undefined,
	totalAssignments: number | null | undefined,
): Map<string, string> => {
	const totals = new Map<string, string>();
	totals.set('name', t('list-total-staff-roles', { count: totalCount ?? 0 }));
	totals.set('type', DASH);
	totals.set(
		'members',
		t('list-total-role-members', { count: totalAssignments ?? 0 }),
	);
	totals.set('description', DASH);
	return totals;
};

export const buildStaffRoleMobileCard =
	(t: Translate) => (row: StaffRoleRow) => ({
		code: t('role'),
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

export const exportStaffRoleRows = (
	rows: StaffRoleRow[],
	t: Translate,
): void => {
	const columns = staffRoleColumns(t);
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
		fileName: `staff-roles-${formatExportDateStamp(new Date())}.csv`,
		mimeType: 'text/csv;charset=utf-8',
	});
};
