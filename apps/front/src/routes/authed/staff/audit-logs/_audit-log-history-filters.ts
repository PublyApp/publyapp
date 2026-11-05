import {
	IconAlertTriangle,
	IconCalendarEvent,
	IconFileSearch,
} from '@tabler/icons-react';
import { createElement } from 'react';
import {
	HISTORY_CATEGORIES,
	historyCategory,
	historyCategoryIcon,
	historyCategoryLabelKey,
	isSensitiveHistoryAction,
} from '~/components/history/history-actions';
import { historyDateLabel } from '~/components/history/history-date';
import type {
	HistoryCategory,
	HistoryFilter,
} from '~/components/history/history-types';

import {
	AUDIT_LOG_PERIODS,
	type AuditLogsListSearchParams,
} from './_list-search-params';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** The backend's action registry, grouped by the history's categories. Built
 * from the `/actions` endpoint so a new backend action appears under its
 * category without a front change. */
export type AuditActionCatalog = ReadonlyMap<
	HistoryCategory,
	readonly string[]
>;

export const buildAuditActionCatalog = (
	actions: readonly string[],
): AuditActionCatalog => {
	const catalog = new Map<HistoryCategory, string[]>();
	for (const category of HISTORY_CATEGORIES) {
		catalog.set(category, []);
	}
	for (const action of actions) {
		catalog.get(historyCategory(action))?.push(action);
	}
	return catalog;
};

const auditActionsOf = (catalog: AuditActionCatalog): string[] =>
	[...catalog.values()].flat();

const sensitiveAuditActions = (catalog: AuditActionCatalog): string[] =>
	auditActionsOf(catalog).filter(isSensitiveHistoryAction);

/** The resolved server-side filter for the URL state. `impossible` means the
 * two dimensions exclude each other (a category with no sensitive action):
 * the page then shows the no-match state instead of querying everything. */
export type AuditLogSelection = {
	actions?: string;
	startDate?: string;
	endDate?: string;
	impossible: boolean;
};

export const resolveAuditLogSelection = ({
	catalog,
	categories,
	sensitivity,
	startDate,
	endDate,
}: {
	catalog: AuditActionCatalog;
	categories: readonly HistoryCategory[];
	sensitivity: boolean;
	startDate?: string;
	endDate?: string;
}): AuditLogSelection => {
	let keys = auditActionsOf(catalog);
	if (categories.length > 0) {
		const selected = new Set<string>(categories);
		keys = keys.filter((action) => selected.has(historyCategory(action)));
	}
	if (sensitivity) {
		keys = keys.filter(isSensitiveHistoryAction);
	}
	const filtered = categories.length > 0 || sensitivity;
	if (filtered && keys.length === 0) {
		return { startDate, endDate, impossible: true };
	}
	return {
		actions: filtered ? keys.join(',') : undefined,
		startDate,
		endDate,
		impossible: false,
	};
};

const periodLabelKey = (period: string): string => `history-period-${period}`;

/**
 * The audit log's filter set (§5.1): Catégories (server-side, through the
 * backend action registry), Période, Sensibilité. Organisations and Acteurs are
 * absent because the API exposes no actor/organisation facet nor a filter by
 * them — reported as an API gap rather than rendered as a dead control.
 */
export const buildAuditLogFilters = ({
	t,
	catalog,
	search,
	categoryCounts = null,
}: {
	t: Translate;
	catalog: AuditActionCatalog;
	search: AuditLogsListSearchParams;
	/** Per-category counts, only when the loaded history is the whole
	 * collection (the API exposes no category facet). */
	categoryCounts?: Record<string, number> | null;
}): HistoryFilter[] => {
	const categories: HistoryFilter['choices'][number][] = [];
	for (const category of HISTORY_CATEGORIES) {
		if ((catalog.get(category)?.length ?? 0) === 0) {
			continue;
		}
		categories.push({
			value: category,
			label: t(historyCategoryLabelKey(category)),
			// Known source, absent category = a real 0. `null` is reserved for
			// "the API has not answered", which is the only unknown.
			count: categoryCounts === null ? null : (categoryCounts[category] ?? 0),
			icon: createElement(historyCategoryIcon(category), {
				'aria-hidden': true,
				className: 'size-4 shrink-0 text-muted-foreground',
			}),
		});
	}

	const periods: HistoryFilter['choices'][number][] = AUDIT_LOG_PERIODS.map(
		(period) => ({ value: period, label: t(periodLabelKey(period)) }),
	);
	if (!search.period && (search.startDate || search.endDate)) {
		periods.push({
			value: 'custom',
			label: `${historyDateLabel(search.startDate)} – ${historyDateLabel(search.endDate)}`,
		});
	}

	const filters: HistoryFilter[] = [];

	if (categories.length > 0) {
		filters.push({
			key: 'category',
			label: t('history-filter-categories'),
			icon: IconFileSearch,
			choices: categories,
			panel: true,
		});
	}

	filters.push({
		key: 'period',
		label: t('history-filter-period'),
		icon: IconCalendarEvent,
		choices: periods,
	});

	if (sensitiveAuditActions(catalog).length > 0) {
		filters.push({
			key: 'sensitivity',
			label: t('history-filter-sensitivity'),
			icon: IconAlertTriangle,
			choices: [
				{
					value: 'sensitive',
					label: t('history-sensitivity-sensitive'),
				},
			],
		});
	}

	return filters;
};
