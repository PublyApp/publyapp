/**
 * Shared wiring for the tenant post list pages (drafts, history): parses the
 * table search params, builds the URL-backed table controller, and resolves
 * the workspace tenant id. Each route keeps its own query/columns/rendering —
 * only the controller plumbing lives here, never a boolean-flag reconciler of
 * two different screens.
 */
import { useTableController } from '~/components/table/use-table-controller';
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';
import type { TableSearchWireParams } from '~/lib/url-state/table-search-params';
import {
	serializeTenantPostListSearchParams,
	type TenantPostListSearchParams,
} from '~/lib/url-state/tenant-post-list-helpers';

/** The list defaults, shared with the route specs so the loader and the page
 * build the very same request variables. */
export const TENANT_POST_LIST_DEFAULT_SORT = {
	id: 'updated_at',
	order: 'desc' as const,
} as const;
export const TENANT_POST_LIST_DEFAULT_SIZE = 20;

export type UseTenantPostListResult = {
	controller: ReturnType<typeof useTableController>;
	tenantId: string | null;
};

export const useTenantPostList = (
	parsedSearch: TenantPostListSearchParams,
	navigate: (opts: { search: TableSearchWireParams; replace: boolean }) => void,
): UseTenantPostListResult => {
	const onSearchChange = (next: {
		q?: string;
		sortId?: string;
		sortOrder?: 'asc' | 'desc';
		cursor?: string;
		size?: number;
	}) => {
		void navigate({
			search: serializeTenantPostListSearchParams(next),
			replace: true,
		});
	};
	const controller = useTableController({
		search: parsedSearch,
		onSearchChange,
		defaultSort: TENANT_POST_LIST_DEFAULT_SORT,
		defaultSize: TENANT_POST_LIST_DEFAULT_SIZE,
	});
	const tenantId = useResolvedWorkspaceTenantId();
	return { controller, tenantId };
};
