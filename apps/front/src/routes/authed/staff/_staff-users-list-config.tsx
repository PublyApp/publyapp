import {
	IconActivity,
	IconCalendar,
	IconCircleDashed,
	IconCrown,
	IconDeviceDesktop,
	IconLanguage,
	IconLock,
	IconMail,
	IconShieldLock,
	IconUser,
	IconUserCircle,
	IconUserPlus,
} from '@tabler/icons-react';
import type { ListColumn, ListFilter } from '~/components/list/list-types';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import type { StaffUserRow } from '~/lib/query/staff-users';
import { buildCsv } from '~/utils/csv';
import { downloadFile, formatExportDateStamp } from '~/utils/download-file';

import { StaffUserNameCell } from './_staff-user-name-cell';
import {
	deriveStaffUserLevelKey,
	deriveStaffUserStatusKey,
} from './staff-users/list-helpers';
import {
	formatAccountLevelLabel,
	formatStaffStatusLabel,
} from './staff-users/status-labels';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const DASH = '—';
const Dash = () => <span className="text-muted-foreground">{DASH}</span>;

export const DEFAULT_STAFF_USER_COLUMNS = [
	'name',
	'email',
	'level',
	'status',
	'profiles',
	'twoFactor',
	'sessions',
	'locale',
	'lastLogin',
	'invitedBy',
	'createdAt',
] as const;

/** The eleven columns of §4.6. Seven have no list-API field: they render the
 * missing-value dash and are not sortable, never a fabricated value. */
export const staffUserColumns = (t: Translate): ListColumn<StaffUserRow>[] => [
	{
		id: 'name',
		header: t('list-column-member'),
		icon: IconUserCircle,
		width: 260,
		value: (row) => row.displayName,
		cell: (row) => <StaffUserNameCell row={row} />,
		// `name` is not a backend sort id (first_name/last_name are).
		sortable: false,
	},
	{
		id: 'email',
		header: t('list-column-email'),
		icon: IconMail,
		width: 270,
		value: (row) => row.email,
		cell: (row) => (
			<span className="block truncate text-muted-foreground" title={row.email}>
				{row.email}
			</span>
		),
	},
	{
		id: 'level',
		header: t('level'),
		icon: IconCrown,
		width: 160,
		value: (row) => row.level,
		cell: (row) =>
			deriveStaffUserLevelKey(row.level) === 'admin' ? (
				<StatusPill tone="info">
					<IconCrown aria-hidden="true" className="size-3" />
					{formatAccountLevelLabel(row.level, t)}
				</StatusPill>
			) : (
				<StatusPill tone="neutral">
					{formatAccountLevelLabel(row.level, t)}
				</StatusPill>
			),
	},
	{
		id: 'status',
		header: t('status'),
		icon: IconCircleDashed,
		width: 130,
		value: (row) => row.status,
		cell: (row) => (
			<StatusPill tone={statusPillTone(row.status)}>
				{formatStaffStatusLabel(row.status, t)}
			</StatusPill>
		),
	},
	{
		id: 'profiles',
		header: t('profiles'),
		icon: IconShieldLock,
		width: 280,
		cell: Dash,
		sortable: false,
	},
	{
		id: 'twoFactor',
		header: t('list-column-two-factor'),
		icon: IconLock,
		width: 230,
		cell: Dash,
		sortable: false,
	},
	{
		id: 'sessions',
		header: t('list-column-open-sessions'),
		icon: IconDeviceDesktop,
		width: 180,
		cell: Dash,
		sortable: false,
	},
	{
		id: 'locale',
		header: t('language'),
		icon: IconLanguage,
		width: 110,
		cell: Dash,
		sortable: false,
	},
	{
		id: 'lastLogin',
		header: t('list-column-last-login'),
		icon: IconActivity,
		width: 190,
		cell: Dash,
		sortable: false,
	},
	{
		id: 'invitedBy',
		header: t('invited-by'),
		icon: IconUserPlus,
		width: 170,
		cell: Dash,
		sortable: false,
	},
	{
		id: 'createdAt',
		header: t('member-since'),
		icon: IconCalendar,
		width: 140,
		cell: Dash,
		sortable: false,
	},
];

/** Statuses reach the API; levels are filtered on the loaded collection only
 * and are offered only when the list page knows it holds the whole collection.
 * Profils (not on the list DTO) and Double authentification (no field at all)
 * are omitted rather than rendering an always-empty filter — #2281 API gaps. */
export const buildStaffUserFilters = (
	t: Translate,
	options: { includeLevels: boolean },
): ListFilter<StaffUserRow>[] => {
	const filters: ListFilter<StaffUserRow>[] = [
		{
			key: 'status',
			label: t('list-statuses'),
			icon: IconCircleDashed,
			panel: true,
			choices: [
				{
					value: 'active',
					label: t('list-staff-status-active'),
					icon: (
						<IconCircleDashed className="size-4 shrink-0 text-[var(--status-resolved-foreground)]" />
					),
				},
				{
					value: 'suspended',
					label: t('list-staff-status-suspended'),
					icon: (
						<IconCircleDashed className="size-4 shrink-0 text-[var(--status-breached-foreground)]" />
					),
				},
			],
			valueOf: (row) => deriveStaffUserStatusKey(row.status) ?? [],
		},
	];

	if (options.includeLevels) {
		filters.push({
			key: 'level',
			label: t('list-levels'),
			icon: IconCrown,
			panel: true,
			choices: [
				{
					value: 'admin',
					label: t('admin'),
					icon: <IconCrown className="size-4 shrink-0 text-muted-foreground" />,
				},
				{
					value: 'user',
					label: t('user'),
					icon: <IconUser className="size-4 shrink-0 text-muted-foreground" />,
				},
			],
			valueOf: (row) => deriveStaffUserLevelKey(row.level) ?? [],
		});
	}

	return filters;
};

/** The pinned footer: only the columns backed by a list-API value get a real
 * summary; the rest stay « — ». The generic page blanks the whole row when the
 * collection is not fully known. */
export const buildStaffUserTotals = (
	t: Translate,
	rows: StaffUserRow[],
): Map<string, string> => {
	let admins = 0;
	let users = 0;
	let active = 0;
	let suspended = 0;
	for (const row of rows) {
		if (deriveStaffUserLevelKey(row.level) === 'admin') {
			admins += 1;
		} else {
			users += 1;
		}
		if (deriveStaffUserStatusKey(row.status) === 'active') {
			active += 1;
		} else if (deriveStaffUserStatusKey(row.status) === 'suspended') {
			suspended += 1;
		}
	}

	const totals = new Map<string, string>();
	totals.set('name', t('list-total-staff-members', { count: rows.length }));
	totals.set('email', DASH);
	totals.set(
		'level',
		t('list-total-staff-levels', { admin: admins, user: users }),
	);
	totals.set('status', t('list-total-staff-statuses', { active, suspended }));
	for (const id of [
		'profiles',
		'twoFactor',
		'sessions',
		'locale',
		'lastLogin',
		'invitedBy',
		'createdAt',
	]) {
		totals.set(id, DASH);
	}
	return totals;
};

export const buildStaffUserMobileCard =
	(t: Translate) => (row: StaffUserRow) => ({
		code: row.email,
		badges: (
			<StatusPill tone={statusPillTone(row.status)}>
				{formatStaffStatusLabel(row.status, t)}
			</StatusPill>
		),
		end: formatAccountLevelLabel(row.level, t),
		title: row.displayName,
		sub: row.email,
		foot: [t('level'), formatAccountLevelLabel(row.level, t)] as [
			string,
			string,
		],
	});

export const exportStaffUserRows = (
	rows: StaffUserRow[],
	t: Translate,
): void => {
	const columns = staffUserColumns(t);
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
		fileName: `staff-users-${formatExportDateStamp(new Date())}.csv`,
		mimeType: 'text/csv;charset=utf-8',
	});
};
