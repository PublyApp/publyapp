import {
	parseTableSearchParams,
	serializeTableSearchParams,
	type TableSearchParamInput,
	type TableSearchParams,
	type TableSearchWireParams,
} from '~/lib/url-state/table-search-params';

const MEMBER_FILTERS = ['with', 'without'] as const;
export type StaffRoleMemberFilter = (typeof MEMBER_FILTERS)[number];
const MEMBER_FILTER_SET = new Set<string>(MEMBER_FILTERS);

export type StaffRoleTypeFilter = 'system' | 'custom';
const ROLE_TYPES = ['system', 'custom'] as const;
const ROLE_TYPE_SET = new Set<string>(ROLE_TYPES);

export type StaffRoleListSearchParams = TableSearchParams & {
	members: StaffRoleMemberFilter[];
	type: StaffRoleTypeFilter[];
};

export type StaffRoleListSearchParamInput = TableSearchParamInput & {
	members?: unknown;
	type?: unknown;
};

const parseStaffRoleTypeFilter = (value: unknown): StaffRoleTypeFilter[] => {
	if (typeof value !== 'string') {
		return [];
	}
	const selected = new Set(
		value
			.split(',')
			.map((token) => token.trim().toLowerCase())
			.filter((token) => ROLE_TYPE_SET.has(token)),
	);
	return ROLE_TYPES.filter((entry) => selected.has(entry));
};

const serializeStaffRoleTypeFilter = (
	values: readonly StaffRoleTypeFilter[],
): string | undefined => {
	const selected = new Set(values);
	const canonical = ROLE_TYPES.filter((entry) => selected.has(entry));
	return canonical.length > 0 ? canonical.join(',') : undefined;
};

const parseStaffRoleMemberFilter = (
	value: unknown,
): StaffRoleMemberFilter[] => {
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

const serializeStaffRoleMemberFilter = (
	values: readonly StaffRoleMemberFilter[],
): string | undefined => {
	const selected = new Set(values);
	const canonical = MEMBER_FILTERS.filter((entry) => selected.has(entry));
	return canonical.length > 0 ? canonical.join(',') : undefined;
};

export const parseStaffRoleListSearchParams = (
	search: StaffRoleListSearchParamInput,
): StaffRoleListSearchParams => ({
	...parseTableSearchParams(search),
	members: parseStaffRoleMemberFilter(search.members),
	type: parseStaffRoleTypeFilter(search.type),
});

export type StaffRoleListWireParams = {
	members?: string;
	type?: string;
} & TableSearchWireParams;

export const serializeStaffRoleListSearchParams = (
	params: StaffRoleListSearchParams,
): StaffRoleListWireParams => ({
	...serializeTableSearchParams(params),
	members: serializeStaffRoleMemberFilter(params.members),
	type: serializeStaffRoleTypeFilter(params.type),
});
