import {
	parseTableSearchParams,
	serializeTableSearchParams,
	type TableSearchParamInput,
	type TableSearchParams,
	type TableSearchWireParams,
} from '~/lib/url-state/table-search-params';

const MEMBER_FILTERS = ['with', 'without'] as const;
export type StaffProfileMemberFilter = (typeof MEMBER_FILTERS)[number];
const MEMBER_FILTER_SET = new Set<string>(MEMBER_FILTERS);

export type StaffProfileTypeFilter = 'system' | 'custom';
const PROFILE_TYPES = ['system', 'custom'] as const;
const PROFILE_TYPE_SET = new Set<string>(PROFILE_TYPES);

export type StaffProfileListSearchParams = TableSearchParams & {
	members: StaffProfileMemberFilter[];
	type: StaffProfileTypeFilter[];
};

export type StaffProfileListSearchParamInput = TableSearchParamInput & {
	members?: unknown;
	type?: unknown;
};

const parseStaffProfileTypeFilter = (
	value: unknown,
): StaffProfileTypeFilter[] => {
	if (typeof value !== 'string') {
		return [];
	}
	const selected = new Set(
		value
			.split(',')
			.map((token) => token.trim().toLowerCase())
			.filter((token) => PROFILE_TYPE_SET.has(token)),
	);
	return PROFILE_TYPES.filter((entry) => selected.has(entry));
};

const serializeStaffProfileTypeFilter = (
	values: readonly StaffProfileTypeFilter[],
): string | undefined => {
	const selected = new Set(values);
	const canonical = PROFILE_TYPES.filter((entry) => selected.has(entry));
	return canonical.length > 0 ? canonical.join(',') : undefined;
};

const parseStaffProfileMemberFilter = (
	value: unknown,
): StaffProfileMemberFilter[] => {
	if (typeof value !== 'string') {
		return [];
	}
	const selected = new Set(
		value
			.split(',')
			.map((token) => token.trim().toLowerCase())
			.filter((token) => MEMBER_FILTER_SET.has(token)),
	);
	return MEMBER_FILTERS.filter((entry) => selected.has(entry));
};

const serializeStaffProfileMemberFilter = (
	values: readonly StaffProfileMemberFilter[],
): string | undefined => {
	const selected = new Set(values);
	const canonical = MEMBER_FILTERS.filter((entry) => selected.has(entry));
	return canonical.length > 0 ? canonical.join(',') : undefined;
};

export const parseStaffProfileListSearchParams = (
	search: StaffProfileListSearchParamInput,
): StaffProfileListSearchParams => ({
	...parseTableSearchParams(search),
	members: parseStaffProfileMemberFilter(search.members),
	type: parseStaffProfileTypeFilter(search.type),
});

export type StaffProfileListWireParams = {
	members?: string;
	type?: string;
} & TableSearchWireParams;

export const serializeStaffProfileListSearchParams = (
	params: StaffProfileListSearchParams,
): StaffProfileListWireParams => ({
	...serializeTableSearchParams(params),
	members: serializeStaffProfileMemberFilter(params.members),
	type: serializeStaffProfileTypeFilter(params.type),
});
