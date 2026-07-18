import { IconUsers } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useEffect, useMemo, useRef, useState } from 'react';
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
 *
 * Rows are keyed by `userAccountId` (the tenant membership id the
 * resolve/assign/unassign endpoints all require), NEVER `row.id` (the global
 * user id used elsewhere for linking to the member's own detail page) —
 * step4b-review BLOCKER 1. A row whose assignment status has not resolved
 * yet renders DISABLED rather than unchecked-and-actionable, which would
 * misrepresent an actually-assigned member as available to assign
 * (step4b-review MAJOR 3).
 */
const makeAssignMembersColumns = (
	t: (key: string, options?: Record<string, unknown>) => string,
	assignedIds: Set<string>,
	resolvedIds: Set<string>,
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
		cell: ({ row }) => {
			const userAccountId = row.original.userAccountId;

			return (
				<Switch
					checked={assignedIds.has(userAccountId)}
					disabled={
						pendingIds.has(userAccountId) || !resolvedIds.has(userAccountId)
					}
					onCheckedChange={(checked) => onToggle(row.original, checked)}
					aria-label={t('assign-member-toggle-label', {
						name: row.original.displayName,
					})}
					data-testid={`assign-member-toggle-${userAccountId}`}
				/>
			);
		},
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
	// Server-truth assignment state — seeded from the resolve endpoint below,
	// or promoted directly from a locally-committed write (never fabricated).
	const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
	// Ids we have an AUTHORITATIVE answer for (a resolve response or a
	// completed local write). A row not yet in this set renders disabled
	// rather than unchecked-and-actionable (step4b-review MAJOR 3).
	const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
	const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
	const [search, setSearch] = useState<TableSearchParams>(EMPTY_SEARCH);
	const assignMember = useAssignStaffTenantProfileUserMutation();
	const unassignMember = useUnassignStaffTenantProfileUserMutation();

	// Guards against a resolve response that predates a since-committed local
	// write from clobbering it: every successful assign/unassign records its
	// commit time here, and a resolve response is only applied to an id if
	// the response's `dataUpdatedAt` is NEWER than that id's last commit
	// (step4b-review MAJOR 3).
	const committedAtRef = useRef<Map<string, number>>(new Map());
	// Dedupes reprocessing the same resolve response object across re-renders
	// that don't carry new data (e.g. a `pendingIds` change).
	const appliedResolveDataRef = useRef<unknown>(undefined);

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
	const rowAccountIds = useMemo(
		() => rows.map((row) => row.userAccountId),
		[rows],
	);

	const resolutionQuery = useStaffTenantProfileMemberAssignmentResolutionQuery(
		{ tenantId, profileId, userAccountIds: rowAccountIds },
		{
			enabled:
				isOpen &&
				tenantId.length > 0 &&
				profileId.length > 0 &&
				rowAccountIds.length > 0,
		},
	);

	// A new drawer target (different tenant/profile) must start from a blank
	// slate — never show a previous profile's resolved/optimistic state while
	// the new profile's own resolve read is still in flight.
	useEffect(() => {
		setAssignedIds(new Set());
		setResolvedIds(new Set());
		setPendingIds(new Set());
		committedAtRef.current = new Map();
		appliedResolveDataRef.current = undefined;
	}, [tenantId, profileId]);

	useEffect(() => {
		const data = resolutionQuery.data;
		if (!data || data === appliedResolveDataRef.current) {
			return;
		}
		appliedResolveDataRef.current = data;

		const dataUpdatedAt = resolutionQuery.dataUpdatedAt;
		const assignmentMap = toStaffTenantProfileMemberAssignmentMap(data);

		setAssignedIds((current) => {
			const next = new Set(current);
			for (const [userAccountId, isAssigned] of Object.entries(assignmentMap)) {
				if (pendingIds.has(userAccountId)) {
					// A write is in flight for this id right now — a read can never
					// be newer than the truth we're actively producing locally.
					continue;
				}

				const committedAt = committedAtRef.current.get(userAccountId);
				if (committedAt !== undefined && dataUpdatedAt <= committedAt) {
					// This response predates (or ties) the last local write for this
					// id — stale for this id even though it's the latest response
					// overall.
					continue;
				}

				if (isAssigned) {
					next.add(userAccountId);
				} else {
					next.delete(userAccountId);
				}
			}
			return next;
		});

		setResolvedIds((current) => {
			const next = new Set(current);
			for (const userAccountId of Object.keys(assignmentMap)) {
				next.add(userAccountId);
			}
			return next;
		});
	}, [resolutionQuery.data, resolutionQuery.dataUpdatedAt, pendingIds]);

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
		const userAccountId = row.userAccountId;
		setPending(userAccountId, true);
		setAssigned(userAccountId, checked);

		try {
			if (checked) {
				await assignMember.mutateAsync({
					tenantId,
					profileId,
					userAccountId,
				});
			} else {
				await unassignMember.mutateAsync({
					tenantId,
					profileId,
					userAccountId,
				});
			}
		} catch (error) {
			// Revert the optimistic flip — the mutation's global feedback owner
			// (router.tsx's MutationCache) already surfaces the failure toast,
			// including the MaxProfilesPerUserExceeded cap and 403 cases, via
			// the centralized failure->message path.
			setAssigned(userAccountId, !checked);
			setPending(userAccountId, false);

			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
			}
			return;
		}

		// This id's local truth is now authoritative — record the commit time so
		// a resolve response fetched before this commit can never clobber it.
		committedAtRef.current.set(userAccountId, Date.now());
		setPending(userAccountId, false);
		// Invalidates the whole staff-tenants scope, which nests the Members-tab
		// roster, this drawer's resolve-assignment read, the profile's
		// `userAccountCount`, and the tenant users list — every real,
		// currently-observable side effect of a toggle.
		await invalidateAllStaffTenantScopes(queryClient);
	};

	const columns = makeAssignMembersColumns(
		t,
		assignedIds,
		resolvedIds,
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
