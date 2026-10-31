import {
	parseTableSearchParams,
	serializeTableSearchParams,
	type TableSearchParamInput,
	type TableSearchParams,
	type TableSearchWireParams,
} from '~/lib/url-state/table-search-params';

const STAFF_USER_STATUS_FILTERS = ['active', 'suspended'] as const;
const STAFF_USER_LEVEL_FILTERS = ['admin', 'user'] as const;

export type StaffUserStatusFilter = (typeof STAFF_USER_STATUS_FILTERS)[number];
export type StaffUserLevelFilter = (typeof STAFF_USER_LEVEL_FILTERS)[number];

const STAFF_USER_STATUS_SET = new Set<string>(STAFF_USER_STATUS_FILTERS);
const STAFF_USER_LEVEL_SET = new Set<string>(STAFF_USER_LEVEL_FILTERS);

export type StaffUserListSearchParams = TableSearchParams & {
	status: StaffUserStatusFilter[];
	level: StaffUserLevelFilter[];
};

export type StaffUserListSearchParamInput = TableSearchParamInput & {
	status?: unknown;
	level?: unknown;
};

const parseChoices = <T extends string>(
	value: unknown,
	allowed: readonly T[],
	known: ReadonlySet<string>,
): T[] => {
	if (typeof value !== 'string') {
		return [];
	}

	const selected = new Set(
		value
			.split(',')
			.map((token) => token.trim().toLowerCase())
			.filter((token) => known.has(token)),
	);
	return allowed.filter((entry) => selected.has(entry));
};

const serializeChoices = <T extends string>(
	values: readonly T[],
	allowed: readonly T[],
): string | undefined => {
	const selected = new Set(values);
	const canonical = allowed.filter((entry) => selected.has(entry));
	return canonical.length > 0 ? canonical.join(',') : undefined;
};

const parseStaffUserStatusFilter = (value: unknown): StaffUserStatusFilter[] =>
	parseChoices(value, STAFF_USER_STATUS_FILTERS, STAFF_USER_STATUS_SET);

const parseStaffUserLevelFilter = (value: unknown): StaffUserLevelFilter[] =>
	parseChoices(value, STAFF_USER_LEVEL_FILTERS, STAFF_USER_LEVEL_SET);

export const deriveStaffUserStatusKey = (
	status: string | null | undefined,
): StaffUserStatusFilter | null => {
	const normalized = status?.trim().toLowerCase();
	if (normalized === 'active' || normalized === 'suspended') {
		return normalized;
	}
	return null;
};

export const deriveStaffUserLevelKey = (
	level: string | null | undefined,
): StaffUserLevelFilter | null => {
	const normalized = level?.trim().toLowerCase();
	if (normalized === 'admin' || normalized === 'user') {
		return normalized;
	}
	return null;
};

export const parseStaffUserListSearchParams = (
	search: StaffUserListSearchParamInput,
): StaffUserListSearchParams => ({
	...parseTableSearchParams(search),
	status: parseStaffUserStatusFilter(search.status),
	level: parseStaffUserLevelFilter(search.level),
});

export type StaffUserListWireParams = {
	status?: string;
	level?: string;
} & TableSearchWireParams;

export const serializeStaffUserListSearchParams = (
	params: StaffUserListSearchParams,
): StaffUserListWireParams => ({
	...serializeTableSearchParams(params),
	status: serializeChoices(params.status, STAFF_USER_STATUS_FILTERS),
	level: serializeChoices(params.level, STAFF_USER_LEVEL_FILTERS),
});
