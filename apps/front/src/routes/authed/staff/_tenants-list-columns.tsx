/**
 * The organisations list's column builder. It is not a component, so it lives
 * apart from `_tenants-list-model.tsx` (react-doctor `only-export-components`):
 * this module exports only the builder and keeps every cell private.
 */

import {
	IconActivity,
	IconBrandStackshare,
	IconBuilding,
	IconCalendar,
	IconChartPie,
	IconCircleDashed,
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

import {
	occupancyBand,
	occupancyPercent,
	tenantStatusKey,
} from './_tenants-list-config';
import type { TenantStatusFilterKey } from './_tenants-list-model';

const STATUS_LABEL_KEY = {
	active: 'list-status-active',
	pending: 'list-status-pending',
	suspended: 'list-status-suspended',
} satisfies Record<TenantStatusFilterKey, string>;

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
