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
	return trimmed.length > 0 ? trimmed : undefined;
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

const parseSize = (value: unknown): number | undefined => {
	if (typeof value === 'number') {
		return isPositiveSafeInteger(value) ? value : undefined;
	}

	const normalized = trimStringOrUndefined(value);
	if (!normalized) {
		return undefined;
	}

	if (!/^\d+$/.test(normalized)) {
		return undefined;
	}

	const parsed = Number(normalized);
	if (!isPositiveSafeInteger(parsed)) {
		return undefined;
	}

	return parsed;
};

const trimIfString = (value: string | undefined): string | undefined => {
	if (!value) {
		return undefined;
	}

	const normalized = value.trim();
	return normalized.length > 0 ? normalized : undefined;
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

export const serializeTableSearchParams = (
	params: TableSearchParams,
): Record<string, string | undefined> => {
	const next: Record<string, string> = {};

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
		next.size = String(params.size);
	}

	return next;
};
