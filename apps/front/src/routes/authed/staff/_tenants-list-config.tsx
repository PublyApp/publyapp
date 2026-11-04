import {
	IconChartPie,
	IconCircleDashed,
	IconLanguage,
} from '@tabler/icons-react';
import type { ListFilter } from '~/components/list/list-types';
import type { UseRowSelectionResult } from '~/components/table/use-row-selection';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import type { StaffTenantRow } from '~/lib/query/staff-tenants';
import { buildCsv } from '~/utils/csv';
import { downloadFile, formatExportDateStamp } from '~/utils/download-file';
import { formatShortDate, getRelativeTimeParts } from '~/utils/format-time';

import type { TenantListCountsResponse } from '@org/client-ts/models/index';

import { tenantColumns } from './_tenants-list-columns';
import { StatusIcon, type TenantStatusFilterKey } from './_tenants-list-model';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** The missing-value convention (§4.1 item 11): « — », never a fabricated 0. */
const DASH = '—';

type OccupancyBand = 'full' | 'high' | 'available';

const TENANT_STATUS_ORDER = [
	'active',
	'pending',
	'suspended',
] as const satisfies readonly TenantStatusFilterKey[];

/** The « Langues » panel values, in the prototype's order. */
const TENANT_LOCALE_ORDER = ['fr', 'en'] as const;

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

/** The organisations list's filters: statuses, seats and languages in the side
 * panel. The « Invitations » filter stays out until a row carries its own
 * pending-invitation count — a filter whose `valueOf` is always empty empties
 * the list with a lie. */
export const buildTenantFilters = (
	t: Translate,
): ListFilter<StaffTenantRow>[] => [
	{
		key: 'status',
		label: t('list-statuses'),
		icon: IconCircleDashed,
		panel: true,
		choices: TENANT_STATUS_ORDER.map((status) => ({
			value: status,
			label: t(`list-status-${status}`),
			icon: <StatusIcon status={status} />,
		})),
		valueOf: (row) => tenantStatusKey(row.status) ?? [],
	},
	{
		key: 'occupancy',
		label: t('list-seats'),
		icon: IconChartPie,
		panel: true,
		choices: [
			{ value: 'full', label: t('list-seats-full') },
			{ value: 'high', label: t('list-seats-high') },
			{ value: 'available', label: t('list-seats-available') },
		],
		valueOf: (row) => occupancyBand(row) ?? [],
	},
	{
		key: 'locale',
		label: t('list-languages'),
		icon: IconLanguage,
		panel: true,
		choices: TENANT_LOCALE_ORDER.map((locale) => ({
			value: locale,
			label: t(`list-language-${locale}`),
		})),
		valueOf: (row) =>
			row.defaultLocale === 'fr' || row.defaultLocale === 'en'
				? row.defaultLocale
				: [],
	},
];

/** The totals row: one summary per column of the filtered rows.
 *
 * `known` is the list page's `countsKnown`: when the loaded page is not the
 * whole collection, every cell shows « — » instead of a page-local sum
 * presented as a total (issue #2274 review round 2). */
export const buildTenantTotals =
	(t: Translate, counts: TenantListCountsResponse | null) =>
	(): Map<string, string> => {
		const members = counts?.members ?? 0;
		const seats = counts?.seats ?? 0;
		const projects = counts?.projects ?? 0;
		const active = counts?.active ?? 0;
		const pending = counts?.pending ?? 0;
		const suspended = counts?.suspended ?? 0;
		const activeThisWeek = counts?.activeThisWeek ?? 0;

		const statusParts = [
			active > 0 ? t('list-total-active', { count: active }) : '',
			pending > 0 ? t('list-total-pending', { count: pending }) : '',
			suspended > 0 ? t('list-total-suspended', { count: suspended }) : '',
		].filter((part) => part.length > 0);

		const dash = '—';
		const map = new Map<string, string>();
		map.set(
			'name',
			t('list-total-organisations', { count: counts?.total ?? 0 }),
		);
		map.set('code', dash);
		map.set('status', statusParts.join(' · '));
		map.set('members', t('list-total-members', { count: members }));
		map.set(
			'occupancy',
			seats > 0
				? t('list-total-seats', {
						percent: Math.round((members / seats) * 100),
						seats,
					})
				: dash,
		);
		map.set('projects', t('list-total-projects', { count: projects }));
		for (const id of [
			'channels',
			'postsMonth',
			'invitations',
			'owners',
			'profiles',
			'locale',
			'timezone',
			'website',
			'billingEmail',
			'createdAt',
		]) {
			map.set(id, dash);
		}
		map.set(
			'lastActivityAt',
			t('list-total-active-week', { count: activeThisWeek }),
		);
		return map;
	};

/** The mobile card's data, from the API row only. */
export const buildTenantMobileCard =
	(t: Translate, locale: string) => (row: StaffTenantRow) => {
		const status = tenantStatusKey(row.status);
		const percent = occupancyPercent(row);
		const relative = row.lastActivityAt
			? getRelativeTimeParts(row.lastActivityAt)
			: null;
		let end = t('list-never');
		if (row.lastActivityAt) {
			end = relative
				? t(relative.key, { count: relative.count })
				: formatShortDate(row.lastActivityAt, locale);
		}
		return {
			code: row.code ?? DASH,
			badges: status ? (
				<StatusPill tone={statusPillTone(row.status)}>
					{t(`list-status-${status}`)}
				</StatusPill>
			) : null,
			end,
			title: row.name,
			sub:
				percent === null
					? `${row.usersCount} ${t('list-column-members')} · —`
					: `${row.usersCount} ${t('list-column-members')} · ${percent} %`,
			foot: [t('list-column-projects'), row.projectsCount] as [string, number],
		};
	};

/** The selected ids, derived once for both the table and its header checkbox. */
export const selectedTenantIds = (
	rows: StaffTenantRow[],
	selection: UseRowSelectionResult,
): Set<string> => {
	const ids = new Set<string>();
	for (const row of rows) {
		if (selection.rowSelection[row.id]) {
			ids.add(row.id);
		}
	}
	return ids;
};

export const toggleTenantSelection = (
	rows: StaffTenantRow[],
	selection: UseRowSelectionResult,
	id: string,
): void => {
	const next = selectedTenantIds(rows, selection);
	if (next.has(id)) {
		next.delete(id);
	} else {
		next.add(id);
	}
	selection.onSelectionChange(next);
};

export const toggleAllTenantSelection = (
	rows: StaffTenantRow[],
	selection: UseRowSelectionResult,
	ids: string[],
): void => {
	const selected = selectedTenantIds(rows, selection);
	selection.onSelectionChange(
		selected.size === ids.length ? new Set() : new Set(ids),
	);
};

/** Export the loaded organisations to CSV (the title row's Export action). */
export const exportTenantRows = (
	rows: StaffTenantRow[],
	t: Translate,
	locale: string,
): void => {
	const columns = tenantColumns(t, locale);
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
		fileName: `${t('list-export-file')}-${formatExportDateStamp(new Date())}.csv`,
		mimeType: 'text/csv;charset=utf-8',
	});
};
