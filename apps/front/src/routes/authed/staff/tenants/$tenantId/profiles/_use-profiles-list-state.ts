import { useQueryClient } from '@tanstack/react-query';
import { useBlocker, useRouter } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { resolveTableBodyState } from '~/components/table/table-body-state';
import { useRowSelection } from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import {
	toStaffTenantProfileRows,
	useDeleteStaffTenantProfileMutation,
	useStaffTenantProfilesQuery,
	type StaffTenantProfileRow,
} from '~/lib/query/staff-tenant-profiles';
import {
	invalidateAllStaffTenantScopes,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';
import type { TableSearchParams } from '~/lib/url-state/table-search-params';

import { makeTenantProfileColumns } from './_profile-columns';
import {
	parseStaffTenantProfilesViewMode,
	toStaffTenantProfileTypeFilterString,
	type StaffTenantProfilesSearchParams,
	type StaffTenantProfilesViewMode,
	type StaffTenantProfileTypeFilter,
} from './_profiles-search-params';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

type UseStaffTenantProfilesListArgs = {
	tenantId: string;
	search: StaffTenantProfilesSearchParams;
	t: (key: string, options?: Record<string, unknown>) => string;
	/** Replace-navigate to `next` (every search write on this page but one). */
	applySearch: (next: StaffTenantProfilesSearchParams) => void;
	/** Push-navigate to `next` — used only by `openEditDrawer` (#972). */
	pushSearch: (next: StaffTenantProfilesSearchParams) => void;
	/** Navigate to a profile's detail page after a successful create. */
	navigateToProfile: (profileId: string) => void;
	/** Live dirty flag of the PAGE-owned create form (develop #1306): the page
	 * renders `createMethods.formState.isDirty` and hands it down so this
	 * hook's nav guard reads dirtiness synchronously during render. */
	isCreateFormDirty: boolean;
};

/**
 * Every piece of list state the tenant-profiles page renders: URL-state
 * writers, the two drawers' open/dirty bookkeeping and their shared nav
 * blocker, the table controller, both queries, selection, and the delete flow.
 * Split out of the route file for `react-doctor/no-giant-component`;
 * semantics are unchanged.
 */
export const useStaffTenantProfilesList = ({
	tenantId,
	search,
	t,
	applySearch,
	pushSearch,
	navigateToProfile,
	isCreateFormDirty,
}: UseStaffTenantProfilesListArgs) => {
	const queryClient = useQueryClient();
	const [deleteTarget, setDeleteTarget] =
		useState<StaffTenantProfileRow | null>(null);
	const [shouldRedirectToLogout, setShouldRedirectToLogout] = useState(false);
	const deleteProfile = useDeleteStaffTenantProfileMutation();
	const [isEditFormDirty, setIsEditFormDirty] = useState(false);

	const isCreateDrawerOpen = search.new === 1;
	const editProfileId = search.edit;

	// `onDirtyChange(false)` (called by the drawer right before an
	// app-initiated close/submit navigation) is an async React state update —
	// a `navigate()` fired synchronously right after it still sees the old
	// (dirty) render's `shouldBlockFn` closure. This ref is set synchronously
	// by every app-initiated close/navigate path below so the guard never
	// blocks its own transition (W8-DRAWER; only a real browser Back or
	// sibling-route nav should ever trip it).
	const createDrawerNavBypassRef = useRef(false);
	const editDrawerNavBypassRef = useRef(false);
	// Opening the edit drawer PUSHES a history entry (see `openEditDrawer`), so
	// a browser Back closes it and lands back on this exact list entry. Closing
	// it from inside the app must therefore consume that entry rather than
	// stack a third one — otherwise the first Back after an open/close round
	// trip would be a dead press that just re-lands on the list. A drawer
	// opened by a deep link has no entry of ours to consume and is closed with
	// a `replace` instead.
	const editDrawerPushedHistoryRef = useRef(false);
	const router = useRouter();

	const onSearchChange = (next: TableSearchParams): void => {
		applySearch(next);
	};

	const setCreateDrawerOpen = (isOpen: boolean): void => {
		// Opening re-arms the guard for the new draft; every close here is
		// either a not-dirty close or a discard the drawer already confirmed.
		createDrawerNavBypassRef.current = !isOpen;
		applySearch({
			...search,
			new: isOpen ? 1 : undefined,
			// The two drawers are mutually exclusive, and the boundary above
			// resolves a both-flags URL in `edit`'s favour — so this is not
			// belt-and-braces: without it, "New profile" while the edit drawer
			// is open would produce `?new=1&edit=<id>`, which canonicalizes
			// straight back to `?edit=<id>` and makes the button a no-op.
			edit: isOpen ? undefined : search.edit,
		});
	};

	const onCreateSaved = (profileId: string): void => {
		// A successful submit must never be blocked by the parent's own nav
		// guard reading a not-yet-flushed dirty flag (W8-DRAWER).
		createDrawerNavBypassRef.current = true;

		if (profileId) {
			navigateToProfile(profileId);
			return;
		}

		setCreateDrawerOpen(false);
	};

	// A PUSH, deliberately — unlike every other search write on this page. The
	// open drawer is its own history entry, so a browser Back closes it and
	// restores this list entry (same filters, same cursor page, same selection,
	// same scroll) instead of leaving the list (#972).
	//
	// This handler is handed to `makeTenantProfileColumns`, so it must stay
	// free of ref writes: the compiler treats any function that mutates a ref
	// as ref-tainted, and passing such a value anywhere during render makes it
	// skip the whole component. The bypass re-arm and PUSH bookkeeping moved
	// to the `useEffect` below, which observes the same open transition.
	const openEditDrawer = (profile: StaffTenantProfileRow): void => {
		pushSearch({
			...search,
			edit: profile.id,
			// Mutually exclusive with the create drawer — cleared here so the
			// pushed URL is right on its own, not only after the boundary
			// canonicalizes it.
			new: undefined,
		});
	};

	const closeEditDrawer = (): void => {
		// Every close routed through here is either a not-dirty close, a
		// discard the drawer already confirmed, or a successful save — none of
		// them may be blocked by this page's own guard reading a not-yet-flushed
		// dirty flag (W8-DRAWER).
		editDrawerNavBypassRef.current = true;

		if (editDrawerPushedHistoryRef.current) {
			editDrawerPushedHistoryRef.current = false;
			router.history.back();
			return;
		}

		applySearch({ ...search, edit: undefined });
	};

	const setTypeFilter = (
		next: StaffTenantProfileTypeFilter | undefined,
	): void => {
		applySearch({
			...search,
			is_default: next === undefined ? undefined : next === 'true',
			cursor: undefined,
		});
	};

	const setView = (next: StaffTenantProfilesViewMode): void => {
		applySearch({
			...search,
			view: next === 'table' ? 'table' : undefined,
		});
	};

	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
		cursorResetKey: `${tenantId}:${search.is_default ?? ''}`,
	});
	const detailsQuery = useStaffTenantDetailsQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);
	const profilesQuery = useStaffTenantProfilesQuery(
		{
			tenantId,
			q: controller.apiVariables.q,
			sortId: controller.apiVariables.sortId,
			sortOrder: controller.apiVariables.sortOrder,
			cursor: controller.apiVariables.cursor,
			size: controller.apiVariables.size,
			isDefault: toStaffTenantProfileTypeFilterString(search.is_default),
		},
		{
			enabled: tenantId.length > 0,
		},
	);

	const rows = toStaffTenantProfileRows(profilesQuery.data?.data);
	const selection = useRowSelection(rows.map((row) => row.id));

	// The drawer edits a row this list already carries — its whole contract is
	// `{ id, name, description, icon?, tone? }`, every field of which is on the
	// row — so opening it costs no extra request. An `?edit=<id>` that names no
	// loaded row (a stale bookmark, or a profile filtered off the current page)
	// simply leaves the drawer shut rather than inventing a profile to show.
	const editingProfile = editProfileId
		? rows.find((row) => row.id === editProfileId)
		: undefined;
	const isEditDrawerOpen = editingProfile !== undefined;
	// Keep the last edited row so the drawer stays mounted through its close
	// animation, exactly as the always-mounted drawer on the detail page does.
	// State (not a ref): the render must read this value, and a ref read
	// during render makes React Compiler skip the whole component.
	const [lastEditedProfile, setLastEditedProfile] =
		useState<StaffTenantProfileRow | null>(null);
	useEffect(() => {
		if (editingProfile) {
			setLastEditedProfile(editingProfile);
		}
	}, [editingProfile]);
	const editDrawerProfile = editingProfile ?? lastEditedProfile;

	// The open transition (no `?edit=<id>` -> one) re-arms the close guard and
	// records that the drawer URL was a PUSH entry — the bookkeeping that used
	// to live inside `openEditDrawer`. Doing it in an effect keeps
	// `openEditDrawer` free of ref writes, which keeps it untainted for the
	// compiler when it is handed to `makeTenantProfileColumns`. Every run of
	// this effect corresponds 1:1 with an open click, so the bookkeeping
	// cannot drift.
	const wasEditDrawerOpenRef = useRef(isEditDrawerOpen);
	useEffect(() => {
		if (isEditDrawerOpen && !wasEditDrawerOpenRef.current) {
			editDrawerNavBypassRef.current = false;
			editDrawerPushedHistoryRef.current = true;
		}
		wasEditDrawerOpenRef.current = isEditDrawerOpen;
	}, [isEditDrawerOpen]);

	// Both drawers' open flags live in the URL (`?new=1`, `?edit=<id>`); a
	// browser Back or a sibling-route navigation changes/unmounts them without
	// ever calling the drawer's own `onOpenChange` close guard, discarding a
	// dirty draft silently (tenants-r1-F2). One blocker owns both, so a
	// transition can never raise two competing confirm dialogs.
	const drawerBlocker = useBlocker({
		shouldBlockFn: ({ current, next }) => {
			if (
				isCreateDrawerOpen &&
				isCreateFormDirty &&
				!createDrawerNavBypassRef.current
			) {
				return true;
			}

			if (
				!isEditDrawerOpen ||
				!isEditFormDirty ||
				editDrawerNavBypassRef.current
			) {
				return false;
			}

			// Mirrors the detail page's guard: a transition that keeps this exact
			// list route AND the same `?edit=<id>` (a filter change, a sort, a
			// page size) leaves the drawer open with its draft intact, so a
			// discard prompt there would be misleading. Only block transitions
			// that actually leave the open drawer.
			const staysOnOpenDrawer =
				next.pathname === current.pathname &&
				(next.search as StaffTenantProfilesSearchParams).edit === editProfileId;

			return !staysOnOpenDrawer;
		},
		withResolver: true,
	});
	const view = parseStaffTenantProfilesViewMode(search.view);

	// tenants-r6-F2: freeze the destructive selection target set — cancel a
	// pending search commit the moment selection mode starts (mirrors
	// invitations/index.tsx, staff-users.tsx, staff/profiles.tsx); the type
	// filter trigger below is disabled for the same reason.
	const { resetDraftToCommitted } = controller.search;
	useEffect(() => {
		if (selection.isSelectionMode) {
			resetDraftToCommitted();
		}
	}, [selection.isSelectionMode, resetDraftToCommitted]);

	// `onEditRequest` is a plain function handed straight to
	// `makeTenantProfileColumns` — no manual memoisation anywhere. The React
	// Compiler caches the columns per value, so identity churn costs nothing,
	// and there is no latest-callback ref indirection to read during render.
	const onEditRequest = (profile: StaffTenantProfileRow): void => {
		openEditDrawer(profile);
	};

	const columns = makeTenantProfileColumns(
		tenantId,
		t,
		onEditRequest,
		setDeleteTarget,
	);

	const hasActiveSearch = Boolean(
		controller.search.committed || search.is_default !== undefined,
	);
	const bodyState = resolveTableBodyState({
		isPending: profilesQuery.isPending,
		isError: profilesQuery.isError,
		rowCount: rows.length,
		hasActiveSearch,
	});

	const toggleCardSelection = (profileId: string): void => {
		const visibleIds = rows.map((row) => row.id);
		const currentlySelected = new Set(
			visibleIds.filter((id) => selection.rowSelection[id]),
		);

		if (currentlySelected.has(profileId)) {
			currentlySelected.delete(profileId);
		} else {
			currentlySelected.add(profileId);
		}

		selection.onSelectionChange(currentlySelected);
	};

	const handleDelete = async () => {
		if (!deleteTarget) {
			return;
		}

		try {
			await deleteProfile.mutateAsync({
				tenantId,
				profileId: deleteTarget.id,
			});
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldRedirectToLogout(true);
			}
			setDeleteTarget(null);
			return;
		}

		setDeleteTarget(null);
		await invalidateAllStaffTenantScopes(queryClient);
	};

	return {
		bodyState,
		closeEditDrawer,
		columns,
		controller,
		deleteProfile,
		deleteTarget,
		detailsQuery,
		drawerBlocker,
		editDrawerProfile,
		handleDelete,
		hasActiveSearch,
		isCreateDrawerOpen,
		isEditDrawerOpen,
		onCreateSaved,
		onEditRequest,
		profilesQuery,
		rows,
		selection,
		setCreateDrawerOpen,
		setDeleteTarget,
		setIsEditFormDirty,
		setShouldRedirectToLogout,
		setTypeFilter,
		setView,
		shouldRedirectToLogout,
		toggleCardSelection,
		view,
	};
};
