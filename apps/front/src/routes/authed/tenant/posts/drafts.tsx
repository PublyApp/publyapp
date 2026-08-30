import { IconPlus } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import type { ColumnDef } from '~/components/table/column-type';
import { DataTable } from '~/components/table/data-table';
import { DataTableRowActions } from '~/components/table/row-actions';
import { useTableController } from '~/components/table/use-table-controller';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';
import { PageHeader } from '~/components/ui/product-page';
import { formatDateTime } from '~/lib/format-date-time';
import {
	invalidateTenantPosts,
	useDeleteTenantPostMutation,
	useTenantPostsQuery,
	toTenantPostRows,
	type TenantPostRow,
} from '~/lib/query/tenant-posts';
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';
import type { TableSearchParamInput } from '~/lib/url-state/table-search-params';
import {
	parseTenantPostListSearchParams,
	serializeTenantPostListSearchParams,
} from '~/lib/url-state/tenant-post-list-helpers';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { CreatePostDrawer } from './_create-post-drawer';

const DEFAULT_SORT = { id: 'updated_at', order: 'desc' as const } as const;

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
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: 20,
	});
	const tenantId = useResolvedWorkspaceTenantId();
	const query = useTenantPostsQuery({
		...controller.apiVariables,
		tenantId: tenantId ?? '',
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
				actions={
					<Button
						variant="default"
						onClick={() => setIsCreateOpen(true)}
						data-testid="tenant-posts-new-post"
					>
						<IconPlus aria-hidden className="size-4" />
						{t('posts:new-post')}
					</Button>
				}
			/>
			<DataTable
				testId="tenant-posts-drafts-table"
				ariaLabel={t('posts:drafts')}
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
	component: TenantPostsDraftsPage,
});
