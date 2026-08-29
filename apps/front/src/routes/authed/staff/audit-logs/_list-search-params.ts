import {
	parseTableSearchParams,
	serializeTableSearchParams,
	type TableSearchParamInput,
	type TableSearchParams,
	type TableSearchWireParams,
} from '~/lib/url-state/table-search-params';

export type AuditLogsListSearchParams = TableSearchParams & {
	/** Comma-separated audit action keys (the list page's only CSV filter). */
	actions?: string;
	/** `YYYY-MM-DD` start-of-range date (wire key `start_date`). */
	startDate?: string;
	/** `YYYY-MM-DD` end-of-range date (wire key `end_date`). */
	endDate?: string;
};

export type AuditLogsListSearchParamInput = TableSearchParamInput & {
	actions?: unknown;
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

/** Splits a CSV action filter, trimming and de-duplicating tokens. Unknown
 * tokens are kept — the backend owns the action allowlist (`/actions` feeds
 * the picker); dropping them here would make a hand-edited URL silently
 * filter less than it asks for. */
export const parseAuditLogsActionsFilter = (value: unknown): string[] => {
	const normalized = normalizeString(value);
	if (!normalized) {
		return [];
	}

	const seen = new Set<string>();
	const actions: string[] = [];

	for (const part of normalized.split(',')) {
		const trimmed = part.trim();
		if (trimmed.length === 0 || seen.has(trimmed)) {
			continue;
		}

		seen.add(trimmed);
		actions.push(trimmed);
	}

	return actions;
};

export const serializeAuditLogsActionsFilter = (
	actions: string[],
): string | undefined => {
	const unique = parseAuditLogsActionsFilter(actions.join(','));
	if (unique.length > 0) {
		return unique.join(',');
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
		actions: serializeAuditLogsActionsFilter(
			parseAuditLogsActionsFilter(search.actions),
		),
		startDate: parseAuditLogsDateFilter(search.start_date),
		endDate: parseAuditLogsDateFilter(search.end_date),
	};
};

export type AuditLogsListWireParams = {
	actions?: string;
	start_date?: string;
	end_date?: string;
} & TableSearchWireParams;

export const serializeAuditLogsListSearchParams = (
	params: AuditLogsListSearchParams,
): AuditLogsListWireParams => {
	const next = serializeTableSearchParams(params);
	const actions = serializeAuditLogsActionsFilter(
		parseAuditLogsActionsFilter(params.actions),
	);

	return {
		...next,
		actions: actions || undefined,
		start_date: parseAuditLogsDateFilter(params.startDate),
		end_date: parseAuditLogsDateFilter(params.endDate),
	};
};

/** Builds the cursor-reset scope: any filter change invalidates the in-memory
 * cursor history, so a stale cursor can never be replayed against a different
 * filter set. */
export const buildAuditLogsCursorResetKey = (
	params: AuditLogsListSearchParams,
): string =>
	[
		serializeAuditLogsActionsFilter(
			parseAuditLogsActionsFilter(params.actions),
		) ?? '',
		params.startDate ?? '',
		params.endDate ?? '',
	].join('\u001E');
