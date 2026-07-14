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

	return { ...base, status: status ?? undefined };
};

export const serializeTenantListSearchParams = (
	params: TenantListSearchParams,
): Record<string, string | undefined> => {
	const next = serializeTableSearchParams(params);
	const status = parseTenantStatusFilter(params.status);

	return { ...next, status: status ?? undefined };
};

/**
 * `validateSearch` must return the SAME snake_case shape the router already
 * merges the navigated destination search into — otherwise the camelCase
 * internal fields (`sortId`/`sortOrder`) leak into the URL alongside their
 * snake_case twins. Round-tripping through parse+serialize here keeps the
 * router's search state on the wire contract; call sites that need the
 * camelCase shape parse `Route.useSearch()` themselves.
 */
export const validateTenantListSearchParams = (
	search: TenantListSearchParamInput,
): Record<string, string | undefined> =>
	serializeTenantListSearchParams(parseTenantListSearchParams(search));
