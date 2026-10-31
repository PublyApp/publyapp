import { IconChartPie, IconCircleDashed } from '@tabler/icons-react';
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

/** The missing-value convention (§4.1 item 11): « — », never a fabricated 0. */
const DASH = '—';

/** The organisations list's filters: statuses and seats in the side panel.
 *
 * ponytail: the « Langues » and « Invitations » filters are omitted until the
 * list API returns `defaultLocale` and a pending-invitation count — offering
 * a filter whose `valueOf` is always empty empties the list with a lie. Both
 * return with the API fields, tracked in issue #2275. */
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
];

/** The totals row: one summary per column of the filtered rows.
 *
 * `known` is the list page's `countsKnown`: when the loaded page is not the
 * whole collection, every cell shows « — » instead of a page-local sum
 * presented as a total (issue #2274 review round 2). */
export const buildTenantTotals =
	(t: Translate, known = true) =>
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
		if (!known) {
			for (const id of map.keys()) {
				map.set(id, DASH);
			}
		}
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
			// The list API has no code: the table shows « — », so the card does too.
			code: DASH,
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
