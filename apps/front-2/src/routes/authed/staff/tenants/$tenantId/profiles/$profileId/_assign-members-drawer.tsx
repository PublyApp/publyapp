import { IconUsers } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable } from '~/components/table/data-table';
import { useTableController } from '~/components/table/use-table-controller';
import { Button } from '~/components/ui/button';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';
import { InitialsAvatar } from '~/components/ui/initials-avatar';
import { Switch } from '~/components/ui/switch';
import {
	toStaffTenantProfileMemberAssignmentMap,
	useAssignStaffTenantProfileUserMutation,
	useStaffTenantProfileMemberAssignmentResolutionQuery,
	useUnassignStaffTenantProfileUserMutation,
} from '~/lib/query/staff-tenant-profiles';
import {
	toStaffTenantUserRows,
	useStaffTenantUsersQuery,
	type StaffTenantUserRow,
} from '~/lib/query/staff-tenant-users';
import { invalidateAllStaffTenantScopes } from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';
import type { TableSearchParams } from '~/lib/url-state/table-search-params';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 20;
const EMPTY_SEARCH: TableSearchParams = {};

/**
 * Per-row assign/unassign toggle, seeded from the batch "resolve assignment"
 * read (#875) so a row's switch starts checked when the tenant member is
 * already assigned — not just when THIS drawer session toggled it. Every
 * toggle click is still a single, immediately-persisted POST/DELETE against
 * the real per-member endpoint; the resolve read only feeds the initial
 * (and post-refresh) checked state.
 */
const makeAssignMembersColumns = (
	t: (key: string, options?: Record<string, unknown>) => string,
	assignedIds: Set<string>,
	pendingIds: Set<string>,
	onToggle: (row: StaffTenantUserRow, checked: boolean) => void,
): ColumnDef<StaffTenantUserRow>[] => [
	{
		id: 'name',
		header: t('members'),
		enableSorting: false,
		cell: ({ row }) => (
			<div className="flex min-w-0 items-center gap-2.5">
				<InitialsAvatar name={row.original.displayName} />
				<span className="min-w-0 space-y-0.5">
					<span
						className="block truncate text-[13px] font-medium"
						title={row.original.displayName}
					>
						{row.original.displayName}
					</span>
					<span
						className="block truncate text-xs text-muted-foreground"
						title={row.original.email}
					>
						{row.original.email}
					</span>
				</span>
			</div>
		),
	},
	{
		id: 'assigned',
		header: () => <span className="sr-only">{t('assign-members')}</span>,
		enableSorting: false,
		meta: { width: '64px', align: 'center' },
		cell: ({ row }) => (
			<Switch
				checked={assignedIds.has(row.original.id)}
				disabled={pendingIds.has(row.original.id)}
				onCheckedChange={(checked) => onToggle(row.original, checked)}
				aria-label={t('assign-member-toggle-label', {
					name: row.original.displayName,
				})}
				data-testid={`assign-member-toggle-${row.original.id}`}
			/>
		),
	},
];

export const AssignMembersDrawer = ({
	tenantId,
	profileId,
	isOpen,
	onOpenChange,
	onSessionExpired,
}: {
	tenantId: string;
	profileId: string;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	// Seeded from the batch resolve-assignment read below once it resolves;
	// until then (or for a row it hasn't covered yet) this only reflects
	// toggles made THIS drawer session. Every toggle is still a single,
	// immediately-persisted POST/DELETE against the real per-member endpoint.
	const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
	const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
	const [search, setSearch] = useState<TableSearchParams>(EMPTY_SEARCH);
	const assignMember = useAssignStaffTenantProfileUserMutation();
	const unassignMember = useUnassignStaffTenantProfileUserMutation();

	const controller = useTableController({
		search,
		onSearchChange: setSearch,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
	});

	const usersQuery = useStaffTenantUsersQuery(
		{
			tenantId,
			q: controller.apiVariables.q,
			sortId: controller.apiVariables.sortId,
			sortOrder: controller.apiVariables.sortOrder,
			cursor: controller.apiVariables.cursor,
			size: controller.apiVariables.size,
		},
		{ enabled: isOpen && tenantId.length > 0 },
	);

	const rows = useMemo(
		() => toStaffTenantUserRows(usersQuery.data?.data),
		[usersQuery.data?.data],
	);
	const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);

	const resolutionQuery = useStaffTenantProfileMemberAssignmentResolutionQuery(
		{ tenantId, profileId, userAccountIds: rowIds },
		{
			enabled:
				isOpen &&
				tenantId.length > 0 &&
				profileId.length > 0 &&
				rowIds.length > 0,
		},
	);

	useEffect(() => {
		if (!resolutionQuery.data) {
			return;
		}

		const assignmentMap = toStaffTenantProfileMemberAssignmentMap(
			resolutionQuery.data,
		);

		setAssignedIds((current) => {
			const next = new Set(current);
			for (const [userAccountId, isAssigned] of Object.entries(assignmentMap)) {
				if (isAssigned) {
					next.add(userAccountId);
				} else {
					next.delete(userAccountId);
				}
			}
			return next;
		});
	}, [resolutionQuery.data]);

	const setPending = (userAccountId: string, isPending: boolean): void => {
		setPendingIds((current) => {
			const next = new Set(current);
			if (isPending) {
				next.add(userAccountId);
			} else {
				next.delete(userAccountId);
			}
			return next;
		});
	};

	const setAssigned = (userAccountId: string, isAssigned: boolean): void => {
		setAssignedIds((current) => {
			const next = new Set(current);
			if (isAssigned) {
				next.add(userAccountId);
			} else {
				next.delete(userAccountId);
			}
			return next;
		});
	};

	const handleToggle = async (
		row: StaffTenantUserRow,
		checked: boolean,
	): Promise<void> => {
		setPending(row.id, true);
		setAssigned(row.id, checked);

		try {
			if (checked) {
				await assignMember.mutateAsync({
					tenantId,
					profileId,
					userAccountId: row.id,
				});
			} else {
				await unassignMember.mutateAsync({
					tenantId,
					profileId,
					userAccountId: row.id,
				});
			}
		} catch (error) {
			// Revert the optimistic flip — the mutation's global feedback owner
			// (router.tsx's MutationCache) already surfaces the failure toast,
			// including the MaxProfilesPerUserExceeded cap and 403 cases, via
			// the centralized failure->message path.
			setAssigned(row.id, !checked);
			setPending(row.id, false);

			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
			}
			return;
		}

		setPending(row.id, false);
		// Invalidates the whole staff-tenants scope, which nests the Members-tab
		// roster, this drawer's resolve-assignment read, the profile's
		// `userAccountCount`, and the tenant users list — every real,
		// currently-observable side effect of a toggle.
		await invalidateAllStaffTenantScopes(queryClient);
	};

	const columns = makeAssignMembersColumns(
		t,
		assignedIds,
		pendingIds,
		(row, checked) => {
			void handleToggle(row, checked);
		},
	);

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) {
					onOpenChange(false);
				}
			}}
		>
			<DrawerContent data-testid="assign-members-drawer">
				<DrawerHeader>
					<DrawerTitle>{t('assign-members')}</DrawerTitle>
					<DrawerDescription>
						{t('assign-members-drawer-description')}
					</DrawerDescription>
				</DrawerHeader>
				<DrawerBody className="flex min-h-0 flex-1 flex-col">
					<DataTable<StaffTenantUserRow>
						testId="assign-members-table"
						ariaLabel={t('assign-members')}
						columns={columns}
						rows={rows}
						getRowLabel={(row) => row.displayName}
						isPending={usersQuery.isPending}
						isError={usersQuery.isError}
						onRetry={() => void usersQuery.refetch()}
						emptyIcon={IconUsers}
						emptyTitle={t('no-tenant-members-to-assign')}
						noMatchTitle={t('tenant-users-no-match-title')}
						noMatchContent={t('tenant-users-no-match-description')}
						hasActiveSearch={Boolean(controller.search.committed)}
						sort={controller.sort}
						onSortChange={controller.onSortChange}
						size={controller.size}
						onSizeChange={controller.onSizeChange}
						pageIndex={controller.cursor.pageIndex}
						hasPreviousPage={controller.cursor.hasPreviousPage}
						hasNextPage={usersQuery.data?.nextCursor != null}
						isPaginationPending={usersQuery.isFetching}
						onNextPage={() =>
							controller.cursor.onNextPage(
								usersQuery.data?.nextCursor ?? undefined,
							)
						}
						onPreviousPage={controller.cursor.onPreviousPage}
						searchDraft={controller.search.draft}
						onSearchDraftChange={controller.search.onDraftChange}
						searchPlaceholder={t('search-tenant-members')}
					/>
				</DrawerBody>
				<DrawerFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						{t('close')}
					</Button>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
};
