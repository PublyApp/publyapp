import { IconUsers } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable } from '~/components/table/data-table';
import { useTableController } from '~/components/table/use-table-controller';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
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

	useEffect(() => {
		setPageIndex(0);
	}, [
		tenantId,
		profileId,
		controller.search.committed,
		controller.sort.id,
		controller.sort.order,
		controller.size,
	]);

	useEffect(() => {
		const totalCount = membersQuery.data?.count ?? 0;
		const lastPageIndex =
			totalCount > 0
				? Math.max(Math.ceil(totalCount / controller.size) - 1, 0)
				: 0;

		if (pageIndex > lastPageIndex) {
			setPageIndex(lastPageIndex);
		}
	}, [controller.size, membersQuery.data?.count, pageIndex]);

	const totalCount = membersQuery.data?.count ?? 0;
	const hasNextPage = (pageIndex + 1) * controller.size < totalCount;

	return (
		<>
			<Card className="min-h-0 flex-1 gap-4 p-5">
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
					getRowLabel={(row) => row.displayName}
					isPending={membersQuery.isPending}
					isError={membersQuery.isError}
					onRetry={() => void membersQuery.refetch()}
					emptyIcon={IconUsers}
					emptyTitle={t('profile-members-empty-title')}
					emptyContent={t('profile-members-empty-description')}
					noMatchTitle={t('tenant-users-no-match-title')}
					noMatchContent={t('tenant-users-no-match-description')}
					hasActiveSearch={Boolean(controller.search.committed)}
					sort={controller.sort}
					onSortChange={controller.onSortChange}
					size={controller.size}
					onSizeChange={controller.onSizeChange}
					pageIndex={pageIndex}
					hasPreviousPage={pageIndex > 0}
					hasNextPage={hasNextPage}
					isPaginationPending={
						membersQuery.isFetching && !membersQuery.isPending
					}
					onNextPage={() => {
						if (hasNextPage) {
							setPageIndex((current) => current + 1);
						}
					}}
					onPreviousPage={() => {
						if (pageIndex > 0) {
							setPageIndex((current) => Math.max(current - 1, 0));
						}
					}}
					searchDraft={controller.search.draft}
					onSearchDraftChange={controller.search.onDraftChange}
					searchPlaceholder={t('search-tenant-members')}
				/>
			</Card>

			<AssignMembersDrawer
				tenantId={tenantId}
				profileId={profileId}
				isOpen={isAssignDrawerOpen}
				onOpenChange={setIsAssignDrawerOpen}
				onSessionExpired={onSessionExpired}
			/>
		</>
	);
};
