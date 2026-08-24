import { IconUsers } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
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
import { PersonAvatar } from '~/components/ui/person-avatar';
import { ErrorStateSurface } from '~/components/ui/state-surface';
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
 * The first column links with the row's GLOBAL `id` (the tenant-users
 * candidate-list identity, matching `/users/{userId}`), per the mandatory
 * entity-link convention (docs/guides/front/conventions.md:254-258) —
 * step4b-rereview MAJOR 5. The assign/unassign toggle is keyed by
 * `userAccountId` (the tenant membership id the resolve/assign/unassign
 * endpoints all require), NEVER `row.id` — step4b-review BLOCKER 1. A row
 * whose assignment status has not resolved yet renders DISABLED rather than
 * unchecked-and-actionable, which would misrepresent an actually-assigned
 * member as available to assign (step4b-review MAJOR 3).
 */
const makeAssignMembersColumns = (
	tenantId: string,
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
			<Link
				to="/staff/tenants/$tenantId/users/$userId"
				params={{ tenantId, userId: row.original.id }}
				className="flex min-w-0 items-center gap-2.5 no-underline"
			>
				<PersonAvatar
					name={row.original.displayName}
					avatarUrl={row.original.avatarUrl}
				/>
				<span className="min-w-0 space-y-0.5">
					<span
						className="publy-record-link block truncate text-[13px] font-medium"
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
			</Link>
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

/**
 * Scoped per (tenantId, profileId) via the callers' `key`: remounting on a
 * new drawer target starts from a blank slate — never showing a previous
 * profile's resolved/optimistic state while the new profile's own resolve
 * read is still in flight — without an adjustment effect
 * (react-doctor/no-adjust-state-on-prop-change). Nothing is lost by the
 * remount: the resolve query's cache entry is already per-profile (both ids
 * are part of its key), so a different profile produces a brand-new entry
 * on its own.
 */
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

	// Cache-key-busting generation for the resolve query (step4b-rereview
	// MAJOR 2 — replaces the earlier `dataUpdatedAt`-vs-wall-clock approach,
	// which compared RECEIVE time against a commit timestamp; those aren't
	// causally ordered, so a slow pre-toggle fetch could still "look newer"
	// than a just-committed write. Bumping this after every commit forces a
	// BRAND NEW query key — a stale in-flight fetch from the previous
	// generation updates only its own (now-unread) cache entry and can never
	// contaminate the current generation's `data`.
	const [resolveGeneration, setResolveGeneration] = useState(0);
	// Dedupes reprocessing the SAME resolve response object across re-renders
	// that don't carry new data (e.g. a `pendingIds` change). Deliberately
	// reset to `undefined` on every scope change (see the row-key effect
	// below) rather than compared once and left standing — keying by object
	// identity ALONE, forever, is wrong: navigating page/search A -> B -> back
	// to A within the default 30s staleTime (router.tsx) makes TanStack Query
	// hand back the IDENTICAL cached object for A a second time, and a plain
	// `data === lastApplied` check that never resets would then skip
	// reprocessing — leaving A's rows stuck disabled even though an
	// authoritative cached answer exists (step4b-r3-rereview finding 1(A)).
	const appliedResolveDataRef = useRef<unknown>(undefined);
	const previousRowAccountIdsKeyRef = useRef<string>('');
	// Mirrors `pendingIds` for the scope-prune effect below, which must read
	// the LATEST pending set without retriggering on every pending change
	// (step4b-r3-rereview finding 1(B)).
	const pendingIdsRef = useRef<Set<string>>(new Set());

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
	const rowAccountIdsKey = rowAccountIds.join(',');

	const resolutionQuery = useStaffTenantProfileMemberAssignmentResolutionQuery(
		{
			tenantId,
			profileId,
			userAccountIds: rowAccountIds,
			generation: resolveGeneration,
		},
		{
			enabled:
				isOpen &&
				tenantId.length > 0 &&
				profileId.length > 0 &&
				rowAccountIds.length > 0,
		},
	);

	// Keeps `pendingIdsRef` current for the scope-prune effect below, without
	// making that effect re-run on every pending-set change (it must stay
	// keyed ONLY on `rowAccountIdsKey`).
	useEffect(() => {
		pendingIdsRef.current = pendingIds;
	}, [pendingIds]);

	// Scope resolved truth to the CURRENT result key (step4b-rereview MAJOR
	// 2): when the candidate page/search changes the row-account-id set,
	// prune local state down to the intersection with the new set instead of
	// letting ids from a previous page/search linger as "resolved" (and
	// therefore actionable) after they're no longer even in view.
	//
	// `pendingIds` is DELIBERATELY EXCLUDED from this prune (step4b-r3-rereview
	// finding 1(B)): an in-flight write is a live operation, not stale display
	// state, and must survive its row scrolling out of view. Pruning it forgets
	// the operation — if the row returns before the mutation settles, the
	// switch could re-enable from cached pre-write data and permit a duplicate
	// write. `assignedIds`/`resolvedIds` retain a pending id's entry too (via
	// the union below) so the optimistic value stays visible instead of
	// flashing back to an empty/default state while away.
	//
	// Resetting `appliedResolveDataRef` here (step4b-r3-rereview finding 1(A))
	// is what makes returning to a previously-visited scope work: without it,
	// the dedup ref would still be pointing at the exact object this scope's
	// resolve query already resolved to (TanStack Query serves the identical
	// cached object within staleTime), and the merge effect below would treat
	// it as "already applied" and skip — even though THIS scope's local state
	// was just pruned away by the block above. Resetting to `undefined` forces
	// the merge effect to re-derive `resolvedIds`/`assignedIds` from whatever
	// `resolutionQuery.data` is available for the CURRENT scope, cached or not.
	useEffect(() => {
		if (previousRowAccountIdsKeyRef.current === rowAccountIdsKey) {
			return;
		}
		previousRowAccountIdsKeyRef.current = rowAccountIdsKey;
		appliedResolveDataRef.current = undefined;

		const currentIds = new Set(rowAccountIds);
		const keep = (id: string): boolean =>
			currentIds.has(id) || pendingIdsRef.current.has(id);
		setAssignedIds((current) => new Set([...current].filter(keep)));
		setResolvedIds((current) => new Set([...current].filter(keep)));
		// eslint-disable-next-line react-hooks/exhaustive-deps -- keyed off the stable joined-id string; rowAccountIds is read, not re-triggered on.
	}, [rowAccountIdsKey]);

	useEffect(() => {
		const data = resolutionQuery.data;
		if (!data || data === appliedResolveDataRef.current) {
			// The scope-prune effect above resets `appliedResolveDataRef` to
			// `undefined` on every row-account-id-set change, so this dedup only
			// ever skips a genuine no-op re-render WITHIN the same scope — it
			// never suppresses reapplying cached data after returning to a
			// previously-visited scope (step4b-r3-rereview finding 1(A)).
			return;
		}
		appliedResolveDataRef.current = data;

		const assignmentMap = toStaffTenantProfileMemberAssignmentMap(data);

		setAssignedIds((current) => {
			const next = new Set(current);
			for (const [userAccountId, isAssigned] of Object.entries(assignmentMap)) {
				if (pendingIds.has(userAccountId)) {
					// A write is in flight for this id right now — never let a read
					// override the truth we're actively producing locally.
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
	}, [resolutionQuery.data, pendingIds]);

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

		setPending(userAccountId, false);
		// Bump the resolve generation so the NEXT resolve fetch is issued under
		// a brand-new query key, guaranteed to reflect at least this commit —
		// any still-in-flight fetch from a previous generation can only ever
		// update its own (now-unread) cache entry (step4b-rereview MAJOR 2).
		setResolveGeneration((generation) => generation + 1);
		// Invalidates the whole staff-tenants scope, which nests the Members-tab
		// roster, the profile's `userAccountCount`, and the tenant users list —
		// every other real, currently-observable side effect of a toggle.
		await invalidateAllStaffTenantScopes(queryClient);
	};

	const columns = makeAssignMembersColumns(
		tenantId,
		t,
		assignedIds,
		resolvedIds,
		pendingIds,
		(row, checked) => {
			void handleToggle(row, checked);
		},
	);

	// Hoisted so the error banner reads a plain local, not a query flag.
	const resolutionIsError = resolutionQuery.isError;

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
				<DrawerBody className="flex min-h-0 flex-1 flex-col gap-3">
					{resolutionIsError ? (
						<ErrorStateSurface
							title={t('assign-members-resolution-error-title')}
							description={t('assign-members-resolution-error-description')}
							actions={
								<Button
									type="button"
									variant="outline"
									onClick={() => void resolutionQuery.refetch()}
								>
									{t('retry')}
								</Button>
							}
							testId="assign-members-resolution-error"
						/>
					) : null}
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
