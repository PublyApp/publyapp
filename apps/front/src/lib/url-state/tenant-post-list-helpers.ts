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
