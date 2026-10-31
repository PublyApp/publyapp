import {
	IconActivity,
	IconBrandStackshare,
	IconBuilding,
	IconCalendar,
	IconChartPie,
	IconCircleCheck,
	IconCircleDashed,
	IconCircleX,
	IconClock,
	IconClockHour4,
	IconFolders,
	IconHash,
	IconLanguage,
	IconMail,
	IconMailDollar,
	IconPencil,
	IconShieldLock,
	IconUserStar,
	IconUsers,
	IconWorld,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { ListColumn } from '~/components/list/list-types';
import { PersonAvatar } from '~/components/ui/person-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import type { StaffTenantRow } from '~/lib/query/staff-tenants';
import { cn } from '~/lib/utils';
import { formatShortDate, getRelativeTimeParts } from '~/utils/format-time';

export type TenantStatusFilterKey = 'active' | 'pending' | 'suspended';
export type OccupancyBand = 'full' | 'high' | 'available';

export const TENANT_STATUS_ORDER = [
	'active',
	'pending',
	'suspended',
] as const satisfies readonly TenantStatusFilterKey[];

const STATUS_LABEL_KEY = {
	active: 'list-status-active',
	pending: 'list-status-pending',
	suspended: 'list-status-suspended',
} satisfies Record<TenantStatusFilterKey, string>;

const STATUS_ICON = {
	active: IconCircleCheck,
	pending: IconClock,
	suspended: IconCircleX,
} satisfies Record<TenantStatusFilterKey, typeof IconCircleCheck>;

const STATUS_TEXT = {
	active: 'text-[var(--publy-chip-active-text)]',
	pending: 'text-[var(--publy-chip-pending-text)]',
	suspended: 'text-[var(--publy-chip-suspended-text)]',
} satisfies Record<TenantStatusFilterKey, string>;

export const tenantStatusKey = (
	status: string | null,
): TenantStatusFilterKey | null => {
	const normalized = status?.trim().toLowerCase();
	if (
		normalized === 'active' ||
		normalized === 'pending' ||
		normalized === 'suspended'
	) {
		return normalized;
	}
	return null;
};

/** The occupancy ratio (0–100), or `null` when the API has no seat cap. */
export const occupancyPercent = (row: StaffTenantRow): number | null => {
	if (row.maxUsers <= 0) {
		return null;
	}
	return Math.min(100, Math.round((row.usersCount / row.maxUsers) * 100));
};

/** Full at 100%, high from 80% (the list's « Presque pleines » rule). */
export const occupancyBand = (row: StaffTenantRow): OccupancyBand | null => {
	const percent = occupancyPercent(row);
	if (percent === null) {
		return null;
	}
	if (percent >= 100) {
		return 'full';
	}
	if (percent >= 80) {
		return 'high';
	}
	return 'available';
};

export const StatusIcon = ({ status }: { status: TenantStatusFilterKey }) => {
	const Icon = STATUS_ICON[status];
	return (
		<Icon
			aria-hidden="true"
			className={cn('size-4 shrink-0', STATUS_TEXT[status])}
		/>
	);
};

const dash = <span className="text-muted-foreground">—</span>;

const numberCell = (value: number | null): ReactNode =>
	value === null ? dash : <span className="tabular-nums">{value}</span>;

const Occupancy = ({ row }: { row: StaffTenantRow }) => {
	const percent = occupancyPercent(row);
	const band = occupancyBand(row);
	if (percent === null || band === null) {
		return dash;
	}

	let bar = 'bg-[var(--publy-chip-active-text)]';
	if (band === 'full') {
		bar = 'bg-[var(--publy-chip-suspended-text)]';
	} else if (band === 'high') {
		bar = 'bg-[var(--publy-chip-pending-text)]';
	}

	return (
		<span className="flex min-w-0 items-center gap-2 tabular-nums">
			<span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-[var(--publy-radius-chip)] bg-secondary">
				<span
					className={cn('block h-full rounded-[var(--publy-radius-chip)]', bar)}
					style={{ width: `${percent}%` }}
				/>
			</span>
			<span>{percent} %</span>
			<span className="truncate text-xs text-muted-foreground">
				{row.usersCount}/{row.maxUsers}
			</span>
		</span>
	);
};

type TenantColumnLabels = {
	organisation: string;
	identifier: string;
	status: string;
	members: string;
	seats: string;
	projects: string;
	connectedAccounts: string;
	postsMonth: string;
	invitations: string;
	owners: string;
	profiles: string;
	language: string;
	timezone: string;
	website: string;
	billingEmail: string;
	createdAt: string;
	lastActivity: string;
};

const tenantColumnLabels = (
	t: (key: string) => string,
): TenantColumnLabels => ({
	organisation: t('list-column-organisation'),
	identifier: t('list-column-identifier'),
	status: t('list-column-status'),
	members: t('list-column-members'),
	seats: t('list-column-seats'),
	projects: t('list-column-projects'),
	connectedAccounts: t('list-column-connected-accounts'),
	postsMonth: t('list-column-posts-month'),
	invitations: t('list-column-invitations'),
	owners: t('list-column-owners'),
	profiles: t('list-column-profiles'),
	language: t('list-column-language'),
	timezone: t('list-column-timezone'),
	website: t('list-column-website'),
	billingEmail: t('list-column-billing-email'),
	createdAt: t('list-column-created-at'),
	lastActivity: t('list-column-last-activity'),
});

/** The 14 columns shown by default, in the design's order. */
export const DEFAULT_TENANT_COLUMNS = [
	'name',
	'code',
	'status',
	'members',
	'occupancy',
	'projects',
	'channels',
	'postsMonth',
	'invitations',
	'owners',
	'locale',
	'timezone',
	'createdAt',
	'lastActivityAt',
] as const;

export const tenantColumns = (
	t: (key: string, options?: Record<string, unknown>) => string,
	locale: string,
): ListColumn<StaffTenantRow>[] => {
	const labels = tenantColumnLabels(t);

	const column = (
		id: string,
		labelKey: keyof TenantColumnLabels,
		width: number,
		icon: typeof IconBuilding,
		cell: (row: StaffTenantRow) => ReactNode,
		value: (row: StaffTenantRow) => string | number | null,
	): ListColumn<StaffTenantRow> => ({
		id,
		header: labels[labelKey],
		icon,
		width,
		value,
		cell,
	});

	return [
		column(
			'name',
			'organisation',
			290,
			IconBuilding,
			(row) => (
				<Link
					to="/staff/tenants/$tenantId"
					params={{ tenantId: row.id }}
					className="flex min-w-0 items-center gap-2.5 no-underline"
				>
					<PersonAvatar name={row.name} avatarUrl={row.logoUrl} />
					<span className="publy-record-link min-w-0 truncate" title={row.name}>
						{row.name}
					</span>
				</Link>
			),
			(row) => row.name,
		),
		column(
			'code',
			'identifier',
			170,
			IconHash,
			() => dash,
			() => null,
		),
		column(
			'status',
			'status',
			130,
			IconCircleDashed,
			(row) => {
				const key = tenantStatusKey(row.status);
				if (!key) {
					return dash;
				}
				return (
					<StatusPill tone={statusPillTone(row.status)}>
						{t(STATUS_LABEL_KEY[key])}
					</StatusPill>
				);
			},
			(row) => row.status,
		),
		column(
			'members',
			'members',
			130,
			IconUsers,
			(row) => numberCell(row.usersCount),
			(row) => row.usersCount,
		),
		column(
			'occupancy',
			'seats',
			190,
			IconChartPie,
			(row) => <Occupancy row={row} />,
			(row) => occupancyPercent(row),
		),
		column(
			'projects',
			'projects',
			120,
			IconFolders,
			(row) => numberCell(row.projectsCount),
			(row) => row.projectsCount,
		),
		column(
			'channels',
			'connectedAccounts',
			200,
			IconBrandStackshare,
			() => dash,
			() => null,
		),
		column(
			'postsMonth',
			'postsMonth',
			210,
			IconPencil,
			() => dash,
			() => null,
		),
		column(
			'invitations',
			'invitations',
			150,
			IconMail,
			() => dash,
			() => null,
		),
		column(
			'owners',
			'owners',
			150,
			IconUserStar,
			() => dash,
			() => null,
		),
		column(
			'profiles',
			'profiles',
			120,
			IconShieldLock,
			() => dash,
			() => null,
		),
		column(
			'locale',
			'language',
			120,
			IconLanguage,
			() => dash,
			() => null,
		),
		column(
			'timezone',
			'timezone',
			190,
			IconClockHour4,
			() => dash,
			() => null,
		),
		column(
			'website',
			'website',
			190,
			IconWorld,
			() => dash,
			() => null,
		),
		column(
			'billingEmail',
			'billingEmail',
			240,
			IconMailDollar,
			() => dash,
			() => null,
		),
		column(
			'createdAt',
			'createdAt',
			130,
			IconCalendar,
			() => dash,
			() => null,
		),
		column(
			'lastActivityAt',
			'lastActivity',
			200,
			IconActivity,
			(row) => {
				if (!row.lastActivityAt) {
					return (
						<span className="text-muted-foreground">{t('list-never')}</span>
					);
				}
				const relative = getRelativeTimeParts(row.lastActivityAt);
				return (
					<span className="tabular-nums">
						{formatShortDate(row.lastActivityAt, locale)}{' '}
						<span className="text-xs text-muted-foreground">
							· {relative ? t(relative.key, { count: relative.count }) : ''}
						</span>
					</span>
				);
			},
			(row) => row.lastActivityAt?.toISOString() ?? null,
		),
	];
};
