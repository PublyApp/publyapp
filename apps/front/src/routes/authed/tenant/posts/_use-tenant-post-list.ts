/**
 * Shared wiring for the tenant post list pages (drafts, history): parses the
 * table search params, builds the URL-backed table controller, and resolves
 * the workspace tenant id. Each route keeps its own query/columns/rendering —
 * only the controller plumbing lives here, never a boolean-flag reconciler of
 * two different screens.
 */
import { useTableController } from '~/components/table/use-table-controller';
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';
import type {
	TableSearchParamInput,
	TableSearchWireParams,
} from '~/lib/url-state/table-search-params';
import {
	parseTenantPostListSearchParams,
	serializeTenantPostListSearchParams,
} from '~/lib/url-state/tenant-post-list-helpers';

const DEFAULT_SORT = {
	id: 'updated_at',
	order: 'desc' as const,
} as const;

export type UseTenantPostListResult = {
	controller: ReturnType<typeof useTableController>;
	tenantId: string | null;
};

export const useTenantPostList = (
	search: TableSearchParamInput,
	navigate: (opts: { search: TableSearchWireParams; replace: boolean }) => void,
): UseTenantPostListResult => {
	const parsedSearch = parseTenantPostListSearchParams(search);
	const onSearchChange = (next: {
		q?: string;
		sortId?: string;
		sortOrder?: 'asc' | 'desc';
		cursor?: string;
		size?: number;
	}) => {
		navigate({
			search: serializeTenantPostListSearchParams(next),
			replace: true,
		});
	};
	const controller = useTableController({
		search: parsedSearch,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: 20,
	});
	const tenantId = useResolvedWorkspaceTenantId();
	return { controller, tenantId };
};
