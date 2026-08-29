import {
	parseTableSearchParams,
	serializeTableSearchParams,
	type TableSearchParamInput,
	type TableSearchParams,
	type TableSearchWireParams,
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
	status: TenantStatusFilter[];
};

export type TenantListSearchParamInput = TableSearchParamInput & {
	status?: unknown;
};

export const parseTenantStatusFilter = (
	value: unknown,
): TenantStatusFilter[] => {
	if (typeof value !== 'string') {
		return [];
	}

	const selected = new Set(
		value
			.split(',')
			.map((token) => token.trim().toLowerCase())
			.filter((token) => TENANT_STATUS_FILTER_SET.has(token)),
	);

	return TENANT_STATUS_FILTERS.filter((status) => selected.has(status));
};

export const serializeTenantStatusFilter = (
	statuses: readonly TenantStatusFilter[],
): string | undefined => {
	const selected = new Set(statuses);
	const canonical = TENANT_STATUS_FILTERS.filter((status) =>
		selected.has(status),
	);
	if (canonical.length > 0) {
		return canonical.join(',');
	}
	return undefined;
};

export const parseTenantListSearchParams = (
	search: TenantListSearchParamInput,
): TenantListSearchParams => ({
	...parseTableSearchParams(search),
	status: parseTenantStatusFilter(search.status),
});

export type TenantListWireParams = {
	status?: string;
} & TableSearchWireParams;

export const serializeTenantListSearchParams = (
	params: TenantListSearchParams,
): TenantListWireParams => ({
	...serializeTableSearchParams(params),
	status: serializeTenantStatusFilter(params.status),
});

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
): TenantListWireParams =>
	serializeTenantListSearchParams(parseTenantListSearchParams(search));
