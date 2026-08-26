import { IconUsers } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable } from '~/components/table/data-table';
import { useOffsetPageClamp } from '~/components/table/offset-pagination';
import { useTableController } from '~/components/table/use-table-controller';
import { Button } from '~/components/ui/button';
import {
	toStaffTenantProfileMemberRows,
	useStaffTenantProfileMembersQuery,
} from '~/lib/query/staff-tenant-profiles';
import type { TableSearchParams } from '~/lib/url-state/table-search-params';

import { AssignMembersDrawer } from './$profileId/_assign-members-drawer';
import { makeProfileMemberColumns } from './_profile-member-columns';

const MEMBERS_DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const MEMBERS_DEFAULT_SIZE = 20;
const EMPTY_SEARCH: TableSearchParams = {};

export const ProfileMembersTab = ({
	tenantId,
	profileId,
	memberCount,
	onSessionExpired,
}: {
	tenantId: string;
	profileId: string;
	memberCount: number;
	onSessionExpired: () => void;
}) => {
	const { t, i18n } = useTranslation(['common', 'staff-tenant-profiles']);
	const [search, setSearch] = useState<TableSearchParams>(EMPTY_SEARCH);
	const [pageIndex, setPageIndex] = useState(0);
	const [isAssignDrawerOpen, setIsAssignDrawerOpen] = useState(false);
	const controller = useTableController({
		search,
		onSearchChange: setSearch,
		defaultSort: MEMBERS_DEFAULT_SORT,
		defaultSize: MEMBERS_DEFAULT_SIZE,
	});
	const membersQuery = useStaffTenantProfileMembersQuery(
		{
			tenantId,
			profileId,
			q: controller.search.committed,
			sortId: controller.sort.id,
			sortOrder: controller.sort.order,
			pageIndex,
			size: controller.size,
		},
		{ enabled: tenantId.length > 0 && profileId.length > 0 },
	);
	const rows = useMemo(
		() => toStaffTenantProfileMemberRows(membersQuery.data?.users),
		[membersQuery.data?.users],
	);
	const columns = useMemo(
		() => makeProfileMemberColumns(tenantId, t, i18n.language),
		[i18n.language, tenantId, t],
	);

	// A deliberate reset (tenant/profile identity, search, sort, or size
	// change) must always win over a clamp derived from the destination
	// query's count — including an already-warm cached count, not just a
	// missing one (#999 review follow-up). Folded into one effect via
	// resetKeys so it cannot race a separate "reset to 0" effect.
	useOffsetPageClamp({
		pageIndex,
		setPageIndex,
		size: controller.size,
		count: membersQuery.data?.count,
		resetKeys: [
			tenantId,
			profileId,
			controller.search.committed,
			controller.sort.id,
			controller.sort.order,
			controller.size,
		],
	});

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
							<span className="ml-2 publy-profile-count-badge align-middle">
								{memberCount}
							</span>
						</h2>
						<p className="text-sm text-muted-foreground">
							{t('profile-members-tab-description')}
						</p>
					</div>
					<Button type="button" onClick={() => setIsAssignDrawerOpen(true)}>
						{t('assign-members')}
					</Button>
				</div>

				<DataTable
					testId="staff-tenant-profile-members-table"
					ariaLabel={t('profile-members-table-aria-label')}
					columns={columns}
					rows={rows}
					queryState={{
						isPending: membersQuery.isPending,
						isError: membersQuery.isError,
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
					emptyTitle={t('profile-members-empty-title')}
					emptyContent={t('profile-members-empty-description')}
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
				key={`assign-${tenantId}:${profileId}`}
				tenantId={tenantId}
				profileId={profileId}
				isOpen={isAssignDrawerOpen}
				onOpenChange={setIsAssignDrawerOpen}
				onSessionExpired={onSessionExpired}
			/>
		</>
	);
};
