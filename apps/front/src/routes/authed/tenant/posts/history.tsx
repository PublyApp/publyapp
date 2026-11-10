import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import type { ColumnDef } from '~/components/table/column-type';
import { DataTable } from '~/components/table/data-table';
import { buildTableApiVariables } from '~/components/table/use-table-controller';
import { PageHeader } from '~/components/ui/product-page';
import { preloadRouteQueries } from '~/lib/query/route-preload';
import {
	POSTS_PUBLISH,
	SOCIAL_ACCOUNTS_PUBLISH,
	tenantPermissionsQueryOptions,
	useTenantPermissions,
} from '~/lib/query/tenant-permissions';
import {
	invalidateTenantPublications,
	tenantPublicationsQueryOptions,
	toTenantPublicationRows,
	useTenantPublicationsQuery,
	type TenantPublicationRow,
} from '~/lib/query/tenant-publications';
import {
	resolveWorkspaceTenantIdFromCache,
	tenantsForPickerQueryOptions,
} from '~/lib/query/tenants-for-picker';
import type { TableSearchParamInput } from '~/lib/url-state/table-search-params';
import {
	parseTenantPostListSearchParams,
	type TenantPostListSearchParams,
} from '~/lib/url-state/tenant-post-list-helpers';
import { formatInZone } from '~/utils/format-time';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { PublicationStatusCell } from './_publication-status-cell';
import {
	MutedWhenSuperseded,
	ScheduledPublicationCustomized,
} from './_scheduled-publication-display';
import {
	TENANT_POST_LIST_DEFAULT_SIZE,
	TENANT_POST_LIST_DEFAULT_SORT,
	useTenantPostList,
} from './_use-tenant-post-list';

/** While any publication is in progress the list refreshes itself on this
 * cadence (query invalidation, so the worker-driven transitions surface
 * without a manual reload); it stops once nothing is in flight. */
const IN_PROGRESS_POLL_MS = 5_000;

/** Keep polling briefly while publish-now waits for worker pickup. */
const SCHEDULED_IN_FLIGHT_WINDOW_MS = 60_000;

/** The page's queries, declared once: the loader warms them and the page reads
 * the same variables. The loader takes the first page (no cursor, decision 4). */
const postHistoryQueries = ({
	tenantId,
	search,
}: {
	tenantId: string;
	search: TenantPostListSearchParams;
}) => {
	const variables = buildTableApiVariables(
		search,
		TENANT_POST_LIST_DEFAULT_SORT,
		TENANT_POST_LIST_DEFAULT_SIZE,
	);

	return {
		publications: {
			options: tenantPublicationsQueryOptions,
			variables: { ...variables, limit: variables.size, tenantId },
		},
		permissions: {
			options: tenantPermissionsQueryOptions,
			variables: { tenantId },
		},
		picker: { options: tenantsForPickerQueryOptions, variables: {} },
	};
};

const TenantPostsHistoryPage = () => {
	const { t, i18n } = useTranslation(['posts', 'common']);
	const navigate = Route.useNavigate();
	const search = parseTenantPostListSearchParams(
		Route.useSearch() as TableSearchParamInput,
	);
	const { controller, tenantId } = useTenantPostList(search, navigate);
	const queries = postHistoryQueries({ tenantId: tenantId ?? '', search });
	const query = useTenantPublicationsQuery({
		...queries.publications.variables,
		// The cursor lives in React state, never in URL search (decision 4): the
		// loader warms the first page, the page adds its own cursor.
		cursor: controller.apiVariables.cursor,
	});
	const rows = toTenantPublicationRows(query.data);
	const { hasPermission } = useTenantPermissions(tenantId);
	const canPublish =
		hasPermission(POSTS_PUBLISH) && hasPermission(SOCIAL_ACCOUNTS_PUBLISH);
	const qc = useQueryClient();
	const hasInProgress = rows.some(
		(publication) => publication.status === 'in_progress',
	);
	const dataUpdatedAt = query.dataUpdatedAt;
	const hasInFlightScheduled =
		dataUpdatedAt > 0 &&
		rows.some(
			(publication) =>
				publication.status === 'scheduled' &&
				publication.updatedAt !== null &&
				dataUpdatedAt - publication.updatedAt.getTime() <=
					SCHEDULED_IN_FLIGHT_WINDOW_MS,
		);
	const hasInFlight = hasInProgress || hasInFlightScheduled;

	useEffect(() => {
		if (!hasInFlight || !tenantId) {
			return;
		}

		const interval = setInterval(() => {
			void invalidateTenantPublications(qc, tenantId);
		}, IN_PROGRESS_POLL_MS);

		return () => clearInterval(interval);
	}, [hasInFlight, tenantId, qc]);

	const language = i18n.resolvedLanguage ?? i18n.language;
	const columns = useMemo<ColumnDef<TenantPublicationRow>[]>(
		() => [
			{
				id: 'account_label',
				header: t('posts:history-account-label'),
				enableSorting: false,
				meta: { width: '200px' },
				cell: ({ row }) =>
					row.original.accountLabel ? (
						<MutedWhenSuperseded superseded={row.original.superseded}>
							<div className="flex flex-wrap items-center gap-1.5">
								<span className="min-w-0 truncate">
									{row.original.accountLabel}
								</span>
								<ScheduledPublicationCustomized
									customized={row.original.customized}
								/>
							</div>
						</MutedWhenSuperseded>
					) : (
						'\u2014'
					),
			},
			{
				id: 'post_excerpt',
				header: t('posts:history-post-label'),
				enableSorting: false,
				cell: ({ row }) => (
					<MutedWhenSuperseded superseded={row.original.superseded}>
						<span
							className="line-clamp-2 min-w-0"
							title={row.original.postExcerpt ?? undefined}
						>
							{row.original.postExcerpt ?? '\u2014'}
						</span>
					</MutedWhenSuperseded>
				),
			},
			{
				id: 'status',
				header: t('posts:history-status-label'),
				enableSorting: false,
				meta: { width: '240px' },
				cell: ({ row }) => (
					<PublicationStatusCell
						publication={row.original}
						tenantId={tenantId ?? ''}
						canPublish={canPublish}
					/>
				),
			},
			{
				id: 'updated_at',
				header: t('common:updated-at'),
				enableSorting: false,
				meta: { width: '132px' },
				cell: ({ row }) => (
					<MutedWhenSuperseded superseded={row.original.superseded}>
						{row.original.updatedAt
							? formatInZone(row.original.updatedAt, undefined, language)
							: '\u2014'}
					</MutedWhenSuperseded>
				),
			},
		],
		[t, language, tenantId, canPublish],
	);

	// Hoisted so the fatal-error gate reads a plain local, not a query flag —
	// QueryDisplay owns state rendering below (DataTable carries the slots).
	const queryError = query.error;
	if (queryError !== null && shouldLogoutForFailure(queryError)) {
		return <LogoutRedirect />;
	}

	return (
		<div className="publy-page-fill" data-testid="tenant-posts-history-page">
			<PageHeader
				title={t('posts:history')}
				description={t('posts:history-description')}
			/>
			<DataTable
				testId="tenant-posts-history-table"
				ariaLabel={t('posts:history')}
				columns={columns}
				rows={rows}
				query={query}
				hasActiveSearch={Boolean(controller.search.committed)}
				pagination={{
					pageIndex: controller.cursor.pageIndex,
					hasPreviousPage: controller.cursor.hasPreviousPage,
					hasNextPage: Boolean(
						(query.data as { nextCursor?: string | null })?.nextCursor,
					),
					isPaginationPending: query.isFetching,
					onNextPage: () =>
						controller.cursor.onNextPage(
							(query.data as { nextCursor?: string | null })?.nextCursor ??
								undefined,
						),
					onPreviousPage: controller.cursor.onPreviousPage,
				}}
				getRowLabel={(r) => r.postExcerpt?.slice(0, 40) ?? ''}
				emptyTitle={t('posts:history-empty-title')}
				sort={controller.sort}
				onSortChange={controller.onSortChange}
				size={controller.size}
				onSizeChange={controller.onSizeChange}
				searchDraft={controller.search.draft}
				onSearchDraftChange={controller.search.onDraftChange}
			/>
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/tenant/posts/history')({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'posts', to: '/tenant/posts' },
			{ kind: 'label', labelKey: 'history' },
		],
		i18nNamespaces: ['posts'],
	},
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) => {
		const tenantId = resolveWorkspaceTenantIdFromCache(context.queryClient);
		if (tenantId === null) {
			return;
		}
		preloadRouteQueries(
			context.queryClient,
			postHistoryQueries({
				tenantId,
				search: parseTenantPostListSearchParams(deps as TableSearchParamInput),
			}),
		);
	},
	component: TenantPostsHistoryPage,
});
