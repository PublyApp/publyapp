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
	deriveStaffUserRoleKey,
	deriveStaffUserStatusKey,
} from './staff-users/list-helpers';
import { formatStaffStatusLabel } from './staff-users/status-labels';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const DASH = '—';
const Dash = () => <span className="text-muted-foreground">{DASH}</span>;

export const DEFAULT_STAFF_USER_COLUMNS = [
	'name',
	'email',
	'status',
	'roles',
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
		id: 'roles',
		header: t('list-roles'),
		icon: IconShieldLock,
		width: 280,
		value: (row) => row.roles.join(', '),
		cell: (row) =>
			row.roles.length > 0 ? (
				<div className="flex flex-wrap gap-1">
					{row.roles.map((role) => (
						<StatusPill
							key={role}
							tone={role === 'Staff Owner' ? 'info' : 'neutral'}
						>
							{role}
						</StatusPill>
					))}
				</div>
			) : (
				<Dash />
			),
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

/** Statuses reach the API; the role filter is applied to the loaded
 * collection only and is offered only when the list page knows it holds the
 * whole collection. The full-access role is the only role distinction the list
 * DTO carries (plus the role names it renders). */
export const buildStaffUserFilters = (
	t: Translate,
	options: { includeRoles: boolean },
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

	if (options.includeRoles) {
		filters.push({
			key: 'role',
			label: t('list-roles'),
			icon: IconCrown,
			panel: true,
			choices: [
				{
					value: 'full_access',
					label: t('full-access'),
					icon: <IconCrown className="size-4 shrink-0 text-muted-foreground" />,
				},
				{
					value: 'standard',
					label: t('standard-access'),
					icon: <IconUser className="size-4 shrink-0 text-muted-foreground" />,
				},
			],
			valueOf: (row) => deriveStaffUserRoleKey(row.isFullAccess),
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
	let fullAccess = 0;
	let standard = 0;
	let active = 0;
	let suspended = 0;
	for (const row of rows) {
		if (row.isFullAccess) {
			fullAccess += 1;
		} else {
			standard += 1;
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
	totals.set('roles', t('list-total-staff-roles', { fullAccess, standard }));
	totals.set('status', t('list-total-staff-statuses', { active, suspended }));
	for (const id of [
		'roles',
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
		end: row.roles.join(', '),
		title: row.displayName,
		sub: row.email,
		foot: [t('list-roles'), row.roles.join(', ')] as [string, string],
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
