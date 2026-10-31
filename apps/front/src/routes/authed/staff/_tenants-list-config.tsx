import {
	IconChartPie,
	IconCircleDashed,
	IconLanguage,
	IconMail,
} from '@tabler/icons-react';
import type { ListFilter } from '~/components/list/list-types';
import type { UseRowSelectionResult } from '~/components/table/use-row-selection';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import type { StaffTenantRow } from '~/lib/query/staff-tenants';
import { buildCsv } from '~/utils/csv';
import { downloadFile, formatExportDateStamp } from '~/utils/download-file';
import { formatShortDate, getRelativeTimeParts } from '~/utils/format-time';

import {
	occupancyBand,
	occupancyPercent,
	StatusIcon,
	TENANT_STATUS_ORDER,
	tenantColumns,
	tenantStatusKey,
} from './_tenants-list-model';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** The organisations list's filters: statuses, seats and languages in the
 * side panel; invitations in the Filters menu only. */
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
		choices: [
			{ value: 'fr', label: 'Français' },
			{ value: 'en', label: 'English' },
		],
		// The list API returns no locale: the filter is offered but no row
		// matches until the API provides one (reported, not faked).
		valueOf: () => [],
	},
	{
		key: 'invitations',
		label: t('list-column-invitations'),
		icon: IconMail,
		choices: [
			{ value: 'with', label: t('list-invitations-with') },
			{ value: 'without', label: t('list-invitations-without') },
		],
		// The list API returns no pending-invitation count.
		valueOf: () => [],
	},
];

/** The totals row: one summary per column of the filtered rows. */
export const buildTenantTotals =
	(t: Translate) =>
	(visible: StaffTenantRow[]): Map<string, string> => {
		let members = 0;
		let seats = 0;
		let projects = 0;
		let active = 0;
		let pending = 0;
		let suspended = 0;
		let activeThisWeek = 0;
		const weekAgo = Date.now() - 7 * 86_400_000;

		for (const row of visible) {
			members += row.usersCount;
			seats += row.maxUsers;
			projects += row.projectsCount;
			const status = tenantStatusKey(row.status);
			if (status === 'active') {
				active += 1;
			} else if (status === 'pending') {
				pending += 1;
			} else if (status === 'suspended') {
				suspended += 1;
			}
			if (row.lastActivityAt && row.lastActivityAt.getTime() >= weekAgo) {
				activeThisWeek += 1;
			}
		}

		const statusParts = [
			active > 0 ? t('list-total-active', { count: active }) : '',
			pending > 0 ? t('list-total-pending', { count: pending }) : '',
			suspended > 0 ? t('list-total-suspended', { count: suspended }) : '',
		].filter((part) => part.length > 0);

		const dash = '—';
		const map = new Map<string, string>();
		map.set('name', t('list-total-organisations', { count: visible.length }));
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
			code: row.id.slice(0, 8),
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
