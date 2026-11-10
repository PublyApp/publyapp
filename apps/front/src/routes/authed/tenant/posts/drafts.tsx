import { IconPlus } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import type { ColumnDef } from '~/components/table/column-type';
import { DataTable } from '~/components/table/data-table';
import { DataTableRowActions } from '~/components/table/row-actions';
import { buildTableApiVariables } from '~/components/table/use-table-controller';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';
import { PageHeader } from '~/components/ui/product-page';
import { preloadRouteQueries } from '~/lib/query/route-preload';
import {
	invalidateTenantPosts,
	tenantPostsQueryOptions,
	useDeleteTenantPostMutation,
	useTenantPostsQuery,
	toTenantPostRows,
	type TenantPostRow,
} from '~/lib/query/tenant-posts';
import { tenantProjectsQueryOptions } from '~/lib/query/tenant-projects';
import { tenantPublishTargetsQueryOptions } from '~/lib/query/tenant-publish-targets';
import {
	resolveWorkspaceTenantIdFromCache,
	tenantsForPickerQueryOptions,
} from '~/lib/query/tenants-for-picker';
import type { TableSearchParamInput } from '~/lib/url-state/table-search-params';
import {
	parseTenantPostListSearchParams,
	type TenantPostListSearchParams,
} from '~/lib/url-state/tenant-post-list-helpers';
import { formatDateTime } from '~/utils/format-time';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { CreatePostDrawer } from './_create-post-drawer';
import {
	TENANT_POST_LIST_DEFAULT_SIZE,
	TENANT_POST_LIST_DEFAULT_SORT,
	useTenantPostList,
} from './_use-tenant-post-list';

/** The page's queries, declared once: the loader warms them and the page reads
 * the same variables. The loader takes the first page (no cursor, decision 4).
 * The create drawer mounts the projects and the publish targets (no project
 * picked yet) even while closed; its permission gate only mounts once the
 * drawer opens, so it is not warmed here. */
const postDraftsQueries = ({
	tenantId,
	search,
}: {
	tenantId: string;
	search: TenantPostListSearchParams;
}) => ({
	posts: {
		options: tenantPostsQueryOptions,
		variables: {
			...buildTableApiVariables(
				search,
				TENANT_POST_LIST_DEFAULT_SORT,
				TENANT_POST_LIST_DEFAULT_SIZE,
			),
			tenantId,
		},
	},
	projects: { options: tenantProjectsQueryOptions, variables: { tenantId } },
	publishTargets: {
		options: tenantPublishTargetsQueryOptions,
		variables: { tenantId, projectId: null },
	},
	picker: { options: tenantsForPickerQueryOptions, variables: {} },
});

/**
 * Honest read-only drafts section: no posts API exists, so the page is a
 * coming-later state — never fabricated draft rows.
 */
const TenantPostsDraftsPage = () => {
	const { t, i18n } = useTranslation(['posts', 'common']);
	const navigate = Route.useNavigate();
	const search = parseTenantPostListSearchParams(
		Route.useSearch() as TableSearchParamInput,
	);
	const { controller, tenantId } = useTenantPostList(search, navigate);
	const queries = postDraftsQueries({ tenantId: tenantId ?? '', search });
	const query = useTenantPostsQuery({
		...queries.posts.variables,
		// The cursor lives in React state, never in URL search (decision 4): the
		// loader warms the first page, the page adds its own cursor.
		cursor: controller.apiVariables.cursor,
	});
	const rows = toTenantPostRows(query.data);
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [pendingBinId, setPendingBinId] = useState<string | null>(null);
	const qc = useQueryClient();
	const deleteMutation = useDeleteTenantPostMutation();

	const confirmBin = async () => {
		if (!pendingBinId || !tenantId) {
			return;
		}
		try {
			await deleteMutation.mutateAsync({
				postId: pendingBinId,
				tenantId,
			});
			await invalidateTenantPosts(qc, tenantId);
			setPendingBinId(null);
		} catch {
			// global MutationCache will toast
		}
	};

	const columns = useMemo<ColumnDef<TenantPostRow>[]>(
		() => [
			{
				id: 'excerpt',
				header: t('posts:body-label'),
				cell: ({ row }) => (
					<Link
						to="/tenant/posts/$postId/edit"
						params={{ postId: row.original.id }}
						className="flex min-w-0 items-center no-underline"
					>
						<span
							className="publy-record-link min-w-0 truncate"
							title={row.original.excerpt}
						>
							{row.original.excerpt.slice(0, 280)}
						</span>
					</Link>
				),
			},
			{
				id: 'updated_at',
				header: t('common:updated-at'),
				meta: { width: '132px' },
				cell: ({ row }) =>
					row.original.updatedAt
						? formatDateTime(row.original.updatedAt, i18n.language)
						: '\u2014',
			},
			{
				id: 'actions',
				header: () => <span className="sr-only">{t('common:actions')}</span>,
				enableSorting: false,
				meta: { width: '40px', align: 'center' },
				cell: ({ row }) => (
					<DataTableRowActions
						ariaLabel={t('common:actions-for', {
							name: row.original.excerpt.slice(0, 40),
						})}
					>
						<DropdownMenuItem
							onClick={() =>
								void navigate({
									to: '/tenant/posts/$postId/edit',
									params: { postId: row.original.id },
								})
							}
						>
							{t('common:edit')}
						</DropdownMenuItem>
						<DropdownMenuItem
							variant="destructive"
							onClick={() => setPendingBinId(row.original.id)}
						>
							{t('posts:move-to-bin')}
						</DropdownMenuItem>
					</DataTableRowActions>
				),
			},
		],
		[t, navigate, i18n.language],
	);

	// Hoisted so the fatal-error gate reads a plain local, not a query flag —
	// QueryDisplay owns state rendering below (DataTable carries the slots).
	const queryError = query.error;
	if (queryError !== null && shouldLogoutForFailure(queryError)) {
		return <LogoutRedirect />;
	}

	return (
		<div className="publy-page-fill" data-testid="tenant-posts-drafts-page">
			<PageHeader
				title={t('posts:drafts')}
				description={t('posts:drafts-description')}
				action={{
					label: t('posts:new-post'),
					icon: IconPlus,
					onSelect: () => setIsCreateOpen(true),
					testId: 'tenant-posts-new-post',
				}}
			/>
			<DataTable
				testId="tenant-posts-drafts-table"
				ariaLabel={t('posts:drafts')}
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
				getRowLabel={(r) => r.excerpt.slice(0, 40)}
				sort={controller.sort}
				onSortChange={controller.onSortChange}
				size={controller.size}
				onSizeChange={controller.onSizeChange}
				searchDraft={controller.search.draft}
				onSearchDraftChange={controller.search.onDraftChange}
			/>
			<CreatePostDrawer
				open={isCreateOpen}
				onOpenChange={setIsCreateOpen}
				tenantId={tenantId ?? ''}
			/>
			<ConfirmDialog
				isOpen={pendingBinId !== null}
				title={t('posts:move-to-bin')}
				description={t('posts:move-to-bin-confirm')}
				confirmLabel={t('posts:move-to-bin')}
				isPending={deleteMutation.isPending}
				onConfirm={() => void confirmBin()}
				onOpenChange={(o) => {
					if (!o) {
						setPendingBinId(null);
					}
				}}
			/>
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/tenant/posts/drafts')({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'posts', to: '/tenant/posts' },
			{ kind: 'label', labelKey: 'drafts' },
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
			postDraftsQueries({
				tenantId,
				search: parseTenantPostListSearchParams(deps as TableSearchParamInput),
			}),
		);
	},
	component: TenantPostsDraftsPage,
});
