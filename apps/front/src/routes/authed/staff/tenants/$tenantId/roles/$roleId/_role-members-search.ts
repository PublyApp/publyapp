import {
	parseTableSearchParams,
	serializeTableSearchParams,
} from '~/lib/url-state/table-search-params';
import type {
	TableSearchParamInput,
	TableSearchParams,
	TableSearchWireParams,
} from '~/lib/url-state/table-search-params';

export type RoleMembersSearchParams = TableSearchParams & { assign?: 1 };
export type RoleMembersSearchParamInput = TableSearchParamInput & {
	assign?: unknown;
};

/** Mirrors `$roleId.tsx`'s `edit` flag: round-trips as the NUMBER 1, never
 * the string `'1'` (the router's search serializer JSON-quotes strings). */
export const parseRoleMembersSearchParams = (
	search: RoleMembersSearchParamInput,
): RoleMembersSearchParams => {
	const base = parseTableSearchParams(search);
	const isAssignOpen =
		search.assign === 1 ||
		(typeof search.assign === 'string' && search.assign.trim() === '1');

	return { ...base, assign: isAssignOpen ? 1 : undefined };
};

export type RoleMembersWireParams = {
	assign?: 1;
} & TableSearchWireParams;

/** The counterpart to `parseRoleMembersSearchParams` — every `navigate`
 * call must serialize through this before writing to the URL, so table
 * state never leaks camelCase keys (`sortId`) into the query string. */
export const serializeRoleMembersSearchParams = (
	params: RoleMembersSearchParams,
): RoleMembersWireParams => ({
	...serializeTableSearchParams(params),
	assign: params.assign,
});
