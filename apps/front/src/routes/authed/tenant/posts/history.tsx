import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import type { ColumnDef } from '~/components/table/column-type';
import { DataTable } from '~/components/table/data-table';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { PageHeader } from '~/components/ui/product-page';
import { formatDateTime } from '~/lib/format-date-time';
import { publicationStatusLabelKey } from '~/lib/publication-status';
import {
	invalidateTenantPublications,
	toTenantPublicationRows,
	useTenantPublicationsQuery,
	type TenantPublicationRow,
} from '~/lib/query/tenant-publications';
import type { TableSearchParamInput } from '~/lib/url-state/table-search-params';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { useTenantPostList } from './_use-tenant-post-list';

/** While any publication is in progress the list refreshes itself on this
 * cadence (query invalidation, so the worker-driven transitions surface
 * without a manual reload); it stops once nothing is in flight. */
const IN_PROGRESS_POLL_MS = 5_000;

/** Keep polling briefly while publish-now waits for worker pickup. */
const SCHEDULED_IN_FLIGHT_WINDOW_MS = 60_000;

const PublicationStatusCell = ({
	publication,
}: {
	publication: TenantPublicationRow;
}) => {
	const { t } = useTranslation(['posts', 'common']);

	if (publication.status === 'in_progress') {
		return (
			<Badge variant="outline" data-testid="tenant-posts-publish-in-progress">
				{t('posts:publish-status-in-progress')}
			</Badge>
		);
	}

	if (publication.status === 'failed') {
		return (
			<div className="flex max-w-xs flex-col items-start gap-1">
				<span
					className="text-muted-foreground text-sm"
					data-testid="tenant-posts-history-cause"
				>
					{publication.lastError ?? t('common:an-error-occurred')}
				</span>
				<Button
					variant="outline"
					size="sm"
					disabled
					title={t('posts:publish-retry-stub-title')}
				>
					{t('posts:publish-retry')}
				</Button>
			</div>
		);
	}

	if (publication.status === 'published' && publication.externalUrl) {
		return (
			<a
				className="publy-record-link"
				data-testid="tenant-posts-history-link"
				href={publication.externalUrl}
				rel="noopener noreferrer"
				target="_blank"
			>
				{t('posts:view-on-bluesky')}
			</a>
		);
	}

	if (publication.status === null || publication.status === '') {
		return <span className="text-muted-foreground">{'\u2014'}</span>;
	}

	const sharedLabelKey = publicationStatusLabelKey(publication.status);
	if (sharedLabelKey === null) {
		return <span className="text-muted-foreground">{'\u2014'}</span>;
	}

	return (
		<span className="text-muted-foreground">
			{t(`posts:${sharedLabelKey}`)}
		</span>
	);
};

const TenantPostsHistoryPage = () => {
	const { t, i18n } = useTranslation(['posts', 'common']);
	const navigate = Route.useNavigate();
	const { controller, tenantId } = useTenantPostList(
		Route.useSearch() as TableSearchParamInput,
		navigate,
	);
	const query = useTenantPublicationsQuery({
		...controller.apiVariables,
		limit: controller.apiVariables.size,
		tenantId: tenantId ?? '',
	});
	const rows = toTenantPublicationRows(query.data);
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

	const columns = useMemo<ColumnDef<TenantPublicationRow>[]>(
		() => [
			{
				id: 'account_label',
				header: t('posts:history-account-label'),
				enableSorting: false,
				meta: { width: '200px' },
				cell: ({ row }) =>
					row.original.accountLabel ? (
						<span className="truncate">{row.original.accountLabel}</span>
					) : (
						'\u2014'
					),
			},
			{
				id: 'post_excerpt',
				header: t('posts:history-post-label'),
				enableSorting: false,
				cell: ({ row }) => (
					<span
						className="line-clamp-2 min-w-0"
						title={row.original.postExcerpt ?? undefined}
					>
						{row.original.postExcerpt ?? '\u2014'}
					</span>
				),
			},
			{
				id: 'status',
				header: t('posts:history-status-label'),
				enableSorting: false,
				meta: { width: '240px' },
				cell: ({ row }) => <PublicationStatusCell publication={row.original} />,
			},
			{
				id: 'updated_at',
				header: t('common:updated-at'),
				enableSorting: false,
				meta: { width: '132px' },
				cell: ({ row }) =>
					row.original.updatedAt
						? formatDateTime(row.original.updatedAt, i18n.language)
						: '\u2014',
			},
		],
		[t, i18n.language],
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
				queryState={{
					isPending: query.isPending,
					isError: query.isError,
					onRetry: () => void query.refetch(),
					hasActiveSearch: Boolean(controller.search.committed),
				}}
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
	component: TenantPostsHistoryPage,
});
