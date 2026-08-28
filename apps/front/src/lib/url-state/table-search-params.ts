export type SortOrder = 'asc' | 'desc';

export type TableSearchParams = {
	q?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	size?: number;
};

export type TableSearchParamInput = {
	q?: unknown;
	sort_id?: unknown;
	sort_order?: unknown;
	cursor?: unknown;
	size?: unknown;
};

const trimStringOrUndefined = (value: unknown): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	if (trimmed.length > 0) return trimmed;
	return undefined;
};

const parseSortOrder = (value: unknown): SortOrder | undefined => {
	const normalized = trimStringOrUndefined(value);

	if (normalized === 'asc' || normalized === 'desc') {
		return normalized;
	}

	return undefined;
};

const isPositiveSafeInteger = (value: number): boolean =>
	Number.isSafeInteger(value) && value > 0;

/**
 * Every table's page-size control (`~/components/table/data-table.tsx`)
 * offers exactly these choices — the single source of truth both the
 * control and the URL-state clamp below derive from, so they can't drift
 * out of sync (review-r3-tests.md F12).
 */
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

/**
 * No table's page-size control can ever request more than this. A
 * hand-typed `size` above this bound falls back to the caller's default
 * instead of being honored, closing the unbounded-page DoS surface
 * (review-r2-tests.md F4).
 */
const MAX_TABLE_SIZE = Math.max(...PAGE_SIZE_OPTIONS);

const parseSize = (value: unknown): number | undefined => {
	if (typeof value === 'number') {
		if (isPositiveSafeInteger(value) && value <= MAX_TABLE_SIZE) return value;
		return undefined;
	}

	const normalized = trimStringOrUndefined(value);
	if (!normalized) {
		return undefined;
	}

	if (!/^\d+$/.test(normalized)) {
		return undefined;
	}

	const parsed = Number(normalized);
	if (!isPositiveSafeInteger(parsed) || parsed > MAX_TABLE_SIZE) {
		return undefined;
	}

	return parsed;
};

const trimIfString = (value: string | undefined): string | undefined => {
	if (!value) {
		return undefined;
	}

	const normalized = value.trim();
	if (normalized.length > 0) return normalized;
	return undefined;
};

export const parseTableSearchParams = (
	search: TableSearchParamInput,
): TableSearchParams => {
	return {
		q: trimStringOrUndefined(search.q),
		sortId: trimStringOrUndefined(search.sort_id),
		sortOrder: parseSortOrder(search.sort_order),
		cursor: trimStringOrUndefined(search.cursor),
		size: parseSize(search.size),
	};
};

export type TableSearchWireParams = {
	q?: string;
	sort_id?: string;
	sort_order?: SortOrder;
	cursor?: string;
	/** Kept as a NUMBER in the route's search state — TanStack serializes
	 * numbers into clean query values, while strings get JSON-quoted. */
	size?: number;
};

export const serializeTableSearchParams = (
	params: TableSearchParams,
): TableSearchWireParams => {
	const next: TableSearchWireParams = {};

	const q = trimIfString(params.q);
	if (q) {
		next.q = q;
	}

	const sortId = trimIfString(params.sortId);
	if (sortId) {
		next.sort_id = sortId;
	}

	if (params.sortOrder) {
		next.sort_order = params.sortOrder;
	}

	const cursor = trimIfString(params.cursor);
	if (cursor) {
		next.cursor = cursor;
	}

	if (isPositiveSafeInteger(params.size ?? -1)) {
		next.size = params.size;
	}

	return next;
};

/**
 * TanStack Router merges validated search over the raw parsed search. Keeping
 * the validator output on the wire-format shape prevents internal camelCase
 * fields from being appended beside their snake_case URL counterparts.
 */
export const validateTableSearchParams = (
	search: TableSearchParamInput,
): TableSearchWireParams => {
	const parsed = parseTableSearchParams(search);

	return {
		...serializeTableSearchParams(parsed),
		// TanStack's default search parser represents an unquoted numeric URL
		// value as a number. Preserve that type at the validation boundary;
		// returning the serializer's string here would rewrite `size=25` as
		// `size=%2225%22`.
		size: parsed.size,
	};
};
