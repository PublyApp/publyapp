import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTableController } from '~/components/table/use-table-controller';
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
import type { TableSearchParams } from '~/lib/url-state/table-search-params';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 20;
const EMPTY_SEARCH: TableSearchParams = {};

export type AssignMembersState = {
	controller: ReturnType<typeof useTableController>;
	usersQuery: ReturnType<typeof useStaffTenantUsersQuery>;
	rows: StaffTenantUserRow[];
	resolutionQuery: ReturnType<
		typeof useStaffTenantProfileMemberAssignmentResolutionQuery
	>;
	assignedIds: Set<string>;
	resolvedIds: Set<string>;
	pendingIds: Set<string>;
	handleToggle: (row: StaffTenantUserRow, checked: boolean) => Promise<void>;
};

/**
 * Owns the assign-members drawer's resolve/assign/unassign state machine:
 * the candidate tenant-users query, the batch resolve-assignment read with
 * its cache-key-busting generation, the optimistic assign/unassign toggles,
 * and the scope-pruning that keeps resolved truth bounded to the rows in view.
 *
 * The drawer-target reset (tenantId/profileId change) runs during render via
 * the "adjusting state on prop change" pattern rather than a prop-change
 * effect, so a new target never briefly flashes the previous profile's
 * resolved/optimistic state (react-doctor no-adjust-state-on-prop-change).
 */
export const useAssignMembersState = ({
	tenantId,
	profileId,
	isOpen,
	onSessionExpired,
}: {
	tenantId: string;
	profileId: string;
	isOpen: boolean;
	onSessionExpired: () => void;
}): AssignMembersState => {
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

	// A new drawer target (different tenant/profile) must start from a blank
	// slate — never show a previous profile's resolved/optimistic state while
	// the new profile's own resolve read is still in flight. The three state
	// sets are reset during render (the "adjusting state on prop change"
	// pattern) so the stale value is never committed to the DOM, instead of a
	// prop-change effect that would flash one stale frame
	// (react-doctor no-adjust-state-on-prop-change). No generation bump is
	// needed here: `tenantId`/`profileId` are themselves part of the resolve
	// query's key, so a different profile already produces a brand-new cache
	// entry on its own. `pendingIdsRef` is intentionally not reset here — it is
	// mirrored from `pendingIds` by the effect below.
	const [scope, setScope] = useState({ tenantId, profileId });
	if (scope.tenantId !== tenantId || scope.profileId !== profileId) {
		setScope({ tenantId, profileId });
		setAssignedIds(new Set());
		setResolvedIds(new Set());
		setPendingIds(new Set());
	}

	// The dedup/scope refs reset on a target change alongside the state — kept
	// in an effect (not during render) because mutating refs during render is
	// unsafe (react-doctor no-ref-current-in-render). The prune effect below
	// also resets these when the row-account-id set changes, but a target
	// change is the authoritative trigger and is keyed directly on the props.
	useEffect(() => {
		appliedResolveDataRef.current = undefined;
		previousRowAccountIdsKeyRef.current = '';
	}, [tenantId, profileId]);

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

		const currentIds = new Set(rowAccountIdsKey.split(',').filter(Boolean));
		const keep = (id: string): boolean =>
			currentIds.has(id) || pendingIdsRef.current.has(id);
		setAssignedIds((current) => new Set([...current].filter(keep)));
		setResolvedIds((current) => new Set([...current].filter(keep)));
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

	return {
		controller,
		usersQuery,
		rows,
		resolutionQuery,
		assignedIds,
		resolvedIds,
		pendingIds,
		handleToggle,
	};
};
