import {
	parseTableSearchParams,
	serializeTableSearchParams,
	type TableSearchParamInput,
	type TableSearchParams,
} from '~/lib/url-state/table-search-params';

// Lifecycle order (mirrors the backend TenantStatus enum): a tenant is
// created Pending and activates when its first owner accepts the invitation.
export const TENANT_STATUS_FILTERS = [
	'pending',
	'active',
	'suspended',
] as const;
export type TenantStatusFilter = (typeof TENANT_STATUS_FILTERS)[number];

const TENANT_STATUS_FILTER_SET = new Set<string>(TENANT_STATUS_FILTERS);

export type TenantListSearchParams = TableSearchParams & {
	status?: TenantStatusFilter;
};

export type TenantListSearchParamInput = TableSearchParamInput & {
	status?: unknown;
};

/** An unrecognized value collapses to `undefined` rather than reaching the API. */
export const parseTenantStatusFilter = (
	value: unknown,
): TenantStatusFilter | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const normalized = value.trim().toLowerCase();
	return TENANT_STATUS_FILTER_SET.has(normalized)
		? (normalized as TenantStatusFilter)
		: undefined;
};

export const parseTenantListSearchParams = (
	search: TenantListSearchParamInput,
): TenantListSearchParams => {
	const base = parseTableSearchParams(search);
	const status = parseTenantStatusFilter(search.status);

	return status ? { ...base, status } : base;
};

export const serializeTenantListSearchParams = (
	params: TenantListSearchParams,
): Record<string, string | undefined> => {
	const next = serializeTableSearchParams(params);
	const status = parseTenantStatusFilter(params.status);

	return status ? { ...next, status } : next;
};
