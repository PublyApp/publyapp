import {
	parseTableSearchParams,
	serializeTableSearchParams,
	type TableSearchParamInput,
	type TableSearchParams,
	type TableSearchWireParams,
} from '~/lib/url-state/table-search-params';

const STAFF_USER_STATUS_FILTERS = ['active', 'suspended'] as const;
const STAFF_USER_ROLE_FILTERS = ['full_access', 'standard'] as const;

export type StaffUserStatusFilter = (typeof STAFF_USER_STATUS_FILTERS)[number];
export type StaffUserRoleFilter = (typeof STAFF_USER_ROLE_FILTERS)[number];

const STAFF_USER_STATUS_SET = new Set<string>(STAFF_USER_STATUS_FILTERS);
const STAFF_USER_ROLE_SET = new Set<string>(STAFF_USER_ROLE_FILTERS);

export type StaffUserListSearchParams = TableSearchParams & {
	status: StaffUserStatusFilter[];
	role: StaffUserRoleFilter[];
};

export type StaffUserListSearchParamInput = TableSearchParamInput & {
	status?: unknown;
	role?: unknown;
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

const parseStaffUserRoleFilter = (value: unknown): StaffUserRoleFilter[] =>
	parseChoices(value, STAFF_USER_ROLE_FILTERS, STAFF_USER_ROLE_SET);

export const deriveStaffUserStatusKey = (
	status: string | null | undefined,
): StaffUserStatusFilter | null => {
	const normalized = status?.trim().toLowerCase();
	if (normalized === 'active' || normalized === 'suspended') {
		return normalized;
	}
	return null;
};

export const deriveStaffUserRoleKey = (
	isFullAccess: boolean,
): StaffUserRoleFilter => (isFullAccess ? 'full_access' : 'standard');

export const parseStaffUserListSearchParams = (
	search: StaffUserListSearchParamInput,
): StaffUserListSearchParams => ({
	...parseTableSearchParams(search),
	status: parseStaffUserStatusFilter(search.status),
	role: parseStaffUserRoleFilter(search.role),
});

export type StaffUserListWireParams = {
	status?: string;
	role?: string;
} & TableSearchWireParams;

export const serializeStaffUserListSearchParams = (
	params: StaffUserListSearchParams,
): StaffUserListWireParams => ({
	...serializeTableSearchParams(params),
	status: serializeChoices(params.status, STAFF_USER_STATUS_FILTERS),
	role: serializeChoices(params.role, STAFF_USER_ROLE_FILTERS),
});
