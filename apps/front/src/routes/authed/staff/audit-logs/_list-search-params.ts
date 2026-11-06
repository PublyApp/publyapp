import { HISTORY_CATEGORIES } from '~/components/history/history-actions';
import type { HistoryCategory } from '~/components/history/history-types';
import {
	parseTableSearchParams,
	serializeTableSearchParams,
	type TableSearchParamInput,
	type TableSearchParams,
	type TableSearchWireParams,
} from '~/lib/url-state/table-search-params';

/** The three relative periods of the history filter (§5.1). */
export type AuditLogPeriod = 'today' | 'week' | 'month';
export const AUDIT_LOG_PERIODS: readonly AuditLogPeriod[] = [
	'today',
	'week',
	'month',
];

export type AuditLogsListSearchParams = TableSearchParams & {
	/** CSV of the selected history categories (`auth,tenant,…`). */
	category?: string;
	/** The relative period; absent for the default (all time) and for a custom
	 * deep-linked range. */
	period?: AuditLogPeriod;
	/** `sensitive` narrows to suspensions, impersonations and refused logins. */
	sensitivity?: 'sensitive';
	/** `YYYY-MM-DD` custom range, kept for deep links that predate the period
	 * presets; the page shows it as a removable chip. */
	startDate?: string;
	endDate?: string;
};

export type AuditLogsListSearchParamInput = TableSearchParamInput & {
	category?: unknown;
	period?: unknown;
	sensitivity?: unknown;
	start_date?: unknown;
	end_date?: unknown;
};

const DATE_QUERY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalizeString = (value: unknown): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	if (trimmed.length > 0) {
		return trimmed;
	}
	return undefined;
};

const KNOWN_CATEGORIES = new Set<string>(HISTORY_CATEGORIES);

/** Splits the category CSV, drops unknown ids and de-duplicates. Unknown ids
 * are dropped here (unlike the old raw action keys): the category set is a
 * closed front-side vocabulary, so a hand-edited id can never silently
 * filter. */
export const parseAuditLogCategories = (value: unknown): HistoryCategory[] => {
	const normalized = normalizeString(value);
	if (!normalized) {
		return [];
	}

	const seen = new Set<string>();
	const categories: HistoryCategory[] = [];
	for (const part of normalized.split(',')) {
		const trimmed = part.trim();
		if (
			trimmed.length === 0 ||
			seen.has(trimmed) ||
			!KNOWN_CATEGORIES.has(trimmed)
		) {
			continue;
		}
		seen.add(trimmed);
		categories.push(trimmed as HistoryCategory);
	}

	return categories;
};

export const serializeAuditLogCategories = (
	categories: readonly string[],
): string | undefined => {
	const unique = parseAuditLogCategories(categories.join(','));
	return unique.length > 0 ? unique.join(',') : undefined;
};

const parseAuditLogPeriod = (value: unknown): AuditLogPeriod | undefined => {
	const normalized = normalizeString(value);
	if (
		normalized === 'today' ||
		normalized === 'week' ||
		normalized === 'month'
	) {
		return normalized;
	}
	return undefined;
};

const isDateQueryValue = (value: string): boolean => {
	if (!DATE_QUERY_PATTERN.test(value)) {
		return false;
	}

	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));

	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
};

export const parseAuditLogsDateFilter = (
	value: unknown,
): string | undefined => {
	const normalized = normalizeString(value);
	if (!normalized || !isDateQueryValue(normalized)) {
		return undefined;
	}

	return normalized;
};

export const parseAuditLogsListSearchParams = (
	search: AuditLogsListSearchParamInput,
): AuditLogsListSearchParams => {
	const base = parseTableSearchParams(search);

	return {
		...base,
		category: serializeAuditLogCategories(
			parseAuditLogCategories(search.category),
		),
		period: parseAuditLogPeriod(search.period),
		sensitivity:
			normalizeString(search.sensitivity) === 'sensitive'
				? 'sensitive'
				: undefined,
		startDate: parseAuditLogsDateFilter(search.start_date),
		endDate: parseAuditLogsDateFilter(search.end_date),
	};
};

export type AuditLogsListWireParams = {
	category?: string;
	period?: AuditLogPeriod;
	sensitivity?: 'sensitive';
	start_date?: string;
	end_date?: string;
} & TableSearchWireParams;

export const serializeAuditLogsListSearchParams = (
	params: AuditLogsListSearchParams,
): AuditLogsListWireParams => {
	const next = serializeTableSearchParams(params);

	return {
		...next,
		category: serializeAuditLogCategories(
			parseAuditLogCategories(params.category),
		),
		period: parseAuditLogPeriod(params.period),
		sensitivity: params.sensitivity === 'sensitive' ? 'sensitive' : undefined,
		start_date: parseAuditLogsDateFilter(params.startDate),
		end_date: parseAuditLogsDateFilter(params.endDate),
	};
};

/** The UTC calendar date `daysAgo` days before `now`, in the API's `YYYY-MM-DD`
 * wire format. */
const isoDay = (now: Date, daysAgo: number): string => {
	const date = new Date(
		Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo),
	);
	return date.toISOString().slice(0, 10);
};

/** The start date a relative period stands for, in the wire format. */
export const auditLogPeriodStart = (
	period: AuditLogPeriod,
	now: Date = new Date(),
): string => {
	switch (period) {
		case 'today':
			return isoDay(now, 0);
		case 'week':
			return isoDay(now, 6);
		case 'month':
			return isoDay(now, 29);
	}
};

/** Builds the cursor-reset scope: any filter change invalidates the in-memory
 * cursor history, so a stale cursor can never be replayed against a different
 * filter set. */
export const buildAuditLogsCursorResetKey = (
	params: AuditLogsListSearchParams,
): string =>
	[
		params.category ?? '',
		params.period ?? '',
		params.sensitivity ?? '',
		params.startDate ?? '',
		params.endDate ?? '',
	].join('\u001E');
