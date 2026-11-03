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

export type StaffProfileListSearchParams = TableSearchParams & {
	members: StaffProfileMemberFilter[];
};

export type StaffProfileListSearchParamInput = TableSearchParamInput & {
	members?: unknown;
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
});

export type StaffProfileListWireParams = {
	members?: string;
} & TableSearchWireParams;

export const serializeStaffProfileListSearchParams = (
	params: StaffProfileListSearchParams,
): StaffProfileListWireParams => ({
	...serializeTableSearchParams(params),
	members: serializeStaffProfileMemberFilter(params.members),
});
