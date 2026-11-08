import { IconUsers } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { DataTable } from '~/components/table/data-table';
import type { useTableController } from '~/components/table/use-table-controller';
import { Button } from '~/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import type {
	useStaffTenantRoleMembersQuery,
	StaffTenantRoleMemberRow,
	toStaffTenantRoleDetails,
	toStaffTenantRoleMemberRows,
} from '~/lib/query/staff-tenant-roles';

import type { makeRoleMemberColumns } from '../_role-member-columns';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export type RoleMembersViewProps = {
	tenantId: string;
	roleId: string;
	t: Translate;
	role: NonNullable<ReturnType<typeof toStaffTenantRoleDetails>>;
	memberColumns: ReturnType<typeof makeRoleMemberColumns>;
	memberRows: ReturnType<typeof toStaffTenantRoleMemberRows>;
	membersQuery: ReturnType<typeof useStaffTenantRoleMembersQuery>;
	membersController: ReturnType<typeof useTableController>;
	membersPageIndex: number;
	setMembersPageIndex: (update: number | ((current: number) => number)) => void;
	onOpenAssignDrawer: () => void;
};

/**
 * The members-tab body of the staff tenant role page: the heading block,
 * the section tabs with their member-count chip, the toolbar row with the
 * assign CTA, and the members DataTable. Split out of the route file for
 * `react-doctor/no-giant-component`; semantics are unchanged.
 */
export const RoleMembersView = ({
	tenantId,
	roleId,
	t,
	role,
	memberColumns,
	memberRows,
	membersQuery,
	membersController,
	membersPageIndex,
	setMembersPageIndex,
	onOpenAssignDrawer,
}: RoleMembersViewProps) => {
	const hasNextPage =
		(membersPageIndex + 1) * membersController.size <
		(membersQuery.data?.count ?? 0);

	return (
		<div className="flex h-full min-h-0 flex-col gap-6">
			<div className="shrink-0 space-y-1">
				<h2 className="text-2xl font-semibold text-foreground">{role.name}</h2>
				<p className="max-w-3xl text-sm text-muted-foreground">
					{role.description ?? t('no-description-provided')}
				</p>
			</div>

			<Tabs value="members" className="min-h-0 flex-1">
				<TabsList
					variant="line"
					aria-label={t('staff-tenant-roles:role-sections')}
					className="shrink-0"
				>
					<TabsTrigger
						value="role"
						render={
							<Link
								to="/staff/tenants/$tenantId/roles/$roleId"
								params={{ tenantId, roleId }}
							/>
						}
					>
						{t('role')}
					</TabsTrigger>
					<TabsTrigger value="members">
						{t('members')}
						<span className="publy-detail-chip publy-detail-chip--outline">
							{role.userAccountCount}
						</span>
					</TabsTrigger>
				</TabsList>

				<TabsContent value="members" className="publy-detail-tab-body min-h-0">
					{/* DataTable already renders its own `.publy-table-card` surface —
					no outer Card here, or it's a card inside a card (#978). */}
					<div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
						<div className="space-y-1">
							<p className="text-lg font-semibold text-foreground">
								{t('members')}
								<span className="ml-2 publy-role-count-badge align-middle">
									{role.userAccountCount}
								</span>
							</p>
							<p className="text-sm text-muted-foreground">
								{t('role-members-tab-description')}
							</p>
						</div>
						<Button
							type="button"
							variant="default"
							onClick={onOpenAssignDrawer}
						>
							{t('assign-members')}
						</Button>
					</div>

					<DataTable<StaffTenantRoleMemberRow>
						testId="staff-tenant-role-members-table"
						ariaLabel={t('role-members-table-aria-label')}
						columns={memberColumns}
						rows={memberRows}
						getRowLabel={(row) => row.displayName}
						query={membersQuery}
						hasActiveSearch={Boolean(membersController.search.committed)}
						emptyIcon={IconUsers}
						emptyTitle={t('role-members-empty-title')}
						emptyContent={t('role-members-empty-description')}
						noMatchTitle={t('tenant-users-no-match-title')}
						noMatchContent={t('tenant-users-no-match-description')}
						pagination={{
							pageIndex: membersPageIndex,
							isPaginationPending:
								membersQuery.isFetching && !membersQuery.isPending,
							hasPreviousPage: membersPageIndex > 0,
							hasNextPage,
							// Offset surface: the count is known once the query lands;
							// while it is in flight the label shows the bare range (#282).
							totalCount: membersQuery.data?.count,
							onNextPage: () => {
								if (hasNextPage) {
									setMembersPageIndex((current) => current + 1);
								}
							},
							onPreviousPage: () => {
								if (membersPageIndex > 0) {
									setMembersPageIndex((current) => Math.max(current - 1, 0));
								}
							},
						}}
						sort={membersController.sort}
						onSortChange={membersController.onSortChange}
						size={membersController.size}
						onSizeChange={membersController.onSizeChange}
						searchDraft={membersController.search.draft}
						onSearchDraftChange={membersController.search.onDraftChange}
						searchPlaceholder={t('search-tenant-members')}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
};
