import { IconUsers } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable } from '~/components/table/data-table';
import { useOffsetPageClamp } from '~/components/table/offset-pagination';
import { useTableController } from '~/components/table/use-table-controller';
import { Button } from '~/components/ui/button';
import {
	toStaffTenantRoleMemberRows,
	useStaffTenantRoleMembersQuery,
} from '~/lib/query/staff-tenant-roles';
import type { TableSearchParams } from '~/lib/url-state/table-search-params';

import { AssignMembersDrawer } from './$roleId/_assign-members-drawer';
import { makeRoleMemberColumns } from './_role-member-columns';

const MEMBERS_DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const MEMBERS_DEFAULT_SIZE = 20;
const EMPTY_SEARCH: TableSearchParams = {};

export const RoleMembersTab = ({
	tenantId,
	roleId,
	memberCount,
	onSessionExpired,
}: {
	tenantId: string;
	roleId: string;
	memberCount: number;
	onSessionExpired: () => void;
}) => {
	const { t, i18n } = useTranslation(['common', 'staff-tenant-roles']);
	const [search, setSearch] = useState<TableSearchParams>(EMPTY_SEARCH);
	const [isAssignDrawerOpen, setIsAssignDrawerOpen] = useState(false);
	const [pageIndex, setPageIndex] = useState(0);
	const controller = useTableController({
		search,
		onSearchChange: setSearch,
		defaultSort: MEMBERS_DEFAULT_SORT,
		defaultSize: MEMBERS_DEFAULT_SIZE,
	});
	const membersQuery = useStaffTenantRoleMembersQuery(
		{
			tenantId,
			roleId,
			q: controller.search.committed,
			sortId: controller.sort.id,
			sortOrder: controller.sort.order,
			pageIndex,
			size: controller.size,
		},
		{ enabled: tenantId.length > 0 && roleId.length > 0 },
	);
	// A deliberate reset (tenant/role identity, search, sort, or size
	// change) must always win over a clamp derived from the destination
	// query's count - including an already-warm cached count, not just a
	// missing one (#999 review follow-up). `useOffsetPageClamp` is now a
	// pure derivation: it returns the value the pageIndex should hold, and
	// the caller commits it during render via React's documented
	// adjust-state-while-rendering pattern. That replaces the previous
	// `useEffect(setPageIndex(clamped))` pattern, which violated
	// no-pass-data-to-parent / no-pass-live-state-to-parent and
	// re-rendered the parent one frame late (#691). On the first render
	// the count is `undefined`, so no clamp fires; once the count lands
	// on a subsequent render, the in-render commit picks it up before the
	// next paint.
	const clampedPageIndex = useOffsetPageClamp({
		pageIndex,
		size: controller.size,
		count: membersQuery.data?.count,
		resetKeys: [
			tenantId,
			roleId,
			controller.search.committed,
			controller.sort.id,
			controller.sort.order,
			controller.size,
		],
	});
	if (clampedPageIndex !== pageIndex) {
		setPageIndex(clampedPageIndex);
	}
	const rows = useMemo(
		() => toStaffTenantRoleMemberRows(membersQuery.data?.users),
		[membersQuery.data?.users],
	);
	const columns = useMemo(
		() => makeRoleMemberColumns(tenantId, t, i18n.language),
		[i18n.language, tenantId, t],
	);

	const totalCount = membersQuery.data?.count ?? 0;
	const hasNextPage = (pageIndex + 1) * controller.size < totalCount;

	return (
		<>
			{/* DataTable already renders its own `.publy-table-card` surface — no
			outer Card here, or it's a card inside a card (#978). */}
			<div className="flex min-h-0 flex-1 flex-col gap-4">
				<div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
					<div className="space-y-1">
						<h2 className="text-lg font-semibold text-foreground">
							{t('members')}
							<span className="ml-2 publy-role-count-badge align-middle">
								{memberCount}
							</span>
						</h2>
						<p className="text-sm text-muted-foreground">
							{t('role-members-tab-description')}
						</p>
					</div>
					<Button type="button" onClick={() => setIsAssignDrawerOpen(true)}>
						{t('assign-members')}
					</Button>
				</div>

				<DataTable
					testId="staff-tenant-role-members-table"
					ariaLabel={t('role-members-table-aria-label')}
					columns={columns}
					rows={rows}
					queryState={{
						isPending: membersQuery.isPending,
						isError: membersQuery.isError,
						error: membersQuery.error,
						onRetry: () => void membersQuery.refetch(),
						hasActiveSearch: Boolean(controller.search.committed),
					}}
					pagination={{
						pageIndex: pageIndex,
						hasPreviousPage: pageIndex > 0,
						hasNextPage: hasNextPage,
						// Offset surface: the count is known once the query lands;
						// while it is in flight the label shows the bare range (#282).
						totalCount: membersQuery.data?.count,
						isPaginationPending:
							membersQuery.isFetching && !membersQuery.isPending,
						onNextPage: () => {
							if (hasNextPage) {
								setPageIndex((current) => current + 1);
							}
						},
						onPreviousPage: () => {
							if (pageIndex > 0) {
								setPageIndex((current) => Math.max(current - 1, 0));
							}
						},
					}}
					getRowLabel={(row) => row.displayName}
					emptyIcon={IconUsers}
					emptyTitle={t('role-members-empty-title')}
					emptyContent={t('role-members-empty-description')}
					noMatchTitle={t('tenant-users-no-match-title')}
					noMatchContent={t('tenant-users-no-match-description')}
					sort={controller.sort}
					onSortChange={controller.onSortChange}
					size={controller.size}
					onSizeChange={controller.onSizeChange}
					searchDraft={controller.search.draft}
					onSearchDraftChange={controller.search.onDraftChange}
					searchPlaceholder={t('search-tenant-members')}
				/>
			</div>

			<AssignMembersDrawer
				key={`assign-${tenantId}:${roleId}`}
				tenantId={tenantId}
				roleId={roleId}
				isOpen={isAssignDrawerOpen}
				onOpenChange={setIsAssignDrawerOpen}
				onSessionExpired={onSessionExpired}
			/>
		</>
	);
};
