import {
	IconActivity,
	IconCalendar,
	IconCircleCheck,
	IconCircleDashed,
	IconCircleX,
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
import { formatDateTime } from '~/utils/format-time';

import type { StaffUserListCounts } from '@org/client-ts/models/index';

import { StaffUserNameCell } from './_staff-user-name-cell';
import {
	deriveStaffUserRoleKey,
	deriveStaffUserStatusKey,
} from './staff-users/list-helpers';
import { formatStaffStatusLabel } from './staff-users/status-labels';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const FALLBACK_LOCALE = 'en';

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

/** The eleven columns of §4.6. Sessions, last sign-in and invited-by come from
 * the list API. 2FA and language have no source yet (follow-ups #2284 and the
 * future MFA feature), so they keep the missing-value dash and are not
 * sortable, never a fabricated value. */
export const staffUserColumns = (
	t: Translate,
	locale: string = FALLBACK_LOCALE,
): ListColumn<StaffUserRow>[] => [
	{
		id: 'name',
		header: t('list-column-member'),
		icon: IconUserCircle,
		// Wide enough for a full « Prénom Nom » at the staff shell's width: the
		// prototype shows whole names, never an ellipsised one.
		width: 330,
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
			row.roles.length === 0 ? (
				<Dash />
			) : (
				<span className="flex min-w-0 flex-wrap items-center gap-1">
					{row.roles.map((name) => (
						<span
							key={name}
							className="inline-flex h-5 items-center rounded-[var(--publy-radius-chip)] border bg-background px-2 text-xs"
						>
							{name}
						</span>
					))}
				</span>
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
		value: (row) => row.openSessions,
		cell: (row) => <span>{row.openSessions}</span>,
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
		value: (row) =>
			row.lastSignInAt === null ? '' : formatDateTime(row.lastSignInAt, locale),
		cell: (row) =>
			row.lastSignInAt === null ? (
				<Dash />
			) : (
				<span>{formatDateTime(row.lastSignInAt, locale)}</span>
			),
		sortable: false,
	},
	{
		id: 'invitedBy',
		header: t('invited-by'),
		icon: IconUserPlus,
		width: 170,
		value: (row) => row.invitedByName ?? '',
		cell: (row) =>
			row.invitedByName === null ? <Dash /> : <span>{row.invitedByName}</span>,
		sortable: false,
	},
	{
		id: 'createdAt',
		header: t('member-since'),
		icon: IconCalendar,
		width: 140,
		value: (row) =>
			row.createdAt === null ? '' : formatDateTime(row.createdAt, locale),
		cell: (row) =>
			row.createdAt === null ? (
				<Dash />
			) : (
				<span>{formatDateTime(row.createdAt, locale)}</span>
			),
		sortable: false,
	},
];

/** Status and access level both reach the API (whole collection, cursor reset).
 * Double authentification is omitted (no field at all) rather than rendering an
 * always-empty filter — #2281 API gap. The full-access role is the only role
 * distinction the list DTO carries; the per-role breakdown is its own panel. */
export const buildStaffUserFilters = (
	t: Translate,
): ListFilter<StaffUserRow>[] => [
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
					<IconCircleCheck className="size-4 shrink-0 text-[var(--publy-chip-active-text)]" />
				),
			},
			{
				value: 'suspended',
				label: t('list-staff-status-suspended'),
				icon: (
					<IconCircleX className="size-4 shrink-0 text-[var(--publy-chip-suspended-text)]" />
				),
			},
		],
		valueOf: (row) => deriveStaffUserStatusKey(row.status) ?? [],
	},
	{
		key: 'role',
		// Its own title: « Rôles » is the per-role panel below it.
		label: t('list-access-level'),
		icon: IconCrown,
		panel: true,
		serverSide: true,
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
	},
];

/** The pinned footer: only the columns backed by a list-API value get a real
 * summary; the rest stay « — ». The generic page blanks the whole row when the
 * collection is not fully known. */
export const buildStaffUserTotals = (
	t: Translate,
	counts: StaffUserListCounts | null | undefined,
): Map<string, string> => {
	const active = counts?.active ?? 0;
	const suspended = counts?.suspended ?? 0;
	const fullAccess = counts?.fullAccess ?? 0;
	const standard = (counts?.total ?? 0) - fullAccess;

	const totals = new Map<string, string>();
	totals.set(
		'name',
		t('list-total-staff-members', { count: counts?.total ?? 0 }),
	);
	totals.set('email', DASH);
	totals.set('roles', t('list-total-staff-roles', { fullAccess, standard }));
	totals.set('status', t('list-total-staff-statuses', { active, suspended }));
	totals.set('sessions', String(counts?.openSessions ?? 0));
	for (const id of [
		'twoFactor',
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
	locale: string = FALLBACK_LOCALE,
): void => {
	const columns = staffUserColumns(t, locale);
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
