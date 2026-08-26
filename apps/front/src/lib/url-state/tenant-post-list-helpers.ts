import {
	parseTableSearchParams,
	serializeTableSearchParams,
	type TableSearchParamInput,
	type TableSearchParams,
	type TableSearchWireParams,
} from '~/lib/url-state/table-search-params';

export type TenantPostListSearchParams = TableSearchParams;

export type TenantPostListSearchParamInput = TableSearchParamInput;

export const parseTenantPostListSearchParams = (
	search: TenantPostListSearchParamInput,
): TenantPostListSearchParams => parseTableSearchParams(search);

export const serializeTenantPostListSearchParams = (
	params: TenantPostListSearchParams,
): TableSearchWireParams => serializeTableSearchParams(params);

/**
 * Round-trip through parse+serialize so the router's search state stays on
 * the wire contract (snake_case keys only).
 */
export const validateTenantPostListSearchParams = (
	search: TenantPostListSearchParamInput,
): TableSearchWireParams =>
	serializeTenantPostListSearchParams(parseTenantPostListSearchParams(search));
