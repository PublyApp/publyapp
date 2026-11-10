import { useQueryClient } from '@tanstack/react-query';
import { useBlocker, useRouter } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { resolveTableBodyState } from '~/components/table/table-body-state';
import { useRowSelection } from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import {
	toStaffTenantRoleRows,
	useDeleteStaffTenantRoleMutation,
	useStaffTenantRolesQuery,
	type StaffTenantRoleRow,
} from '~/lib/query/staff-tenant-roles';
import {
	invalidateAllStaffTenantScopes,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import type { TableSearchParams } from '~/lib/url-state/table-search-params';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import {
	ROLES_DEFAULT_SIZE,
	ROLES_DEFAULT_SORT,
	tenantRolesListQueries,
} from './_queries';
import { makeTenantRoleColumns } from './_role-columns';
import {
	parseStaffTenantRolesViewMode,
	type StaffTenantRolesSearchParams,
	type StaffTenantRolesViewMode,
	type StaffTenantRoleTypeFilter,
} from './_roles-search-params';

type UseStaffTenantRolesListArgs = {
	tenantId: string;
	search: StaffTenantRolesSearchParams;
	t: (key: string, options?: Record<string, unknown>) => string;
	/** Replace-navigate to `next` (every search write on this page but one). */
	applySearch: (next: StaffTenantRolesSearchParams) => void;
	/** Push-navigate to `next` — used only by `openEditDrawer` (#972). */
	pushSearch: (next: StaffTenantRolesSearchParams) => void;
	/** Navigate to a role's detail page after a successful create. */
	navigateToRole: (roleId: string) => void;
	/** Live dirty flag of the PAGE-owned create form (develop #1306): the page
	 * renders `createMethods.formState.isDirty` and hands it down so this
	 * hook's nav guard reads dirtiness synchronously during render. */
	isCreateFormDirty: boolean;
};

/**
 * Every piece of list state the tenant-roles page renders: URL-state
 * writers, the two drawers' open/dirty bookkeeping and their shared nav
 * blocker, the table controller, both queries, selection, and the delete flow.
 * Split out of the route file for `react-doctor/no-giant-component`;
 * semantics are unchanged.
 */
export const useStaffTenantRolesList = ({
	tenantId,
	search,
	t,
	applySearch,
	pushSearch,
	navigateToRole,
	isCreateFormDirty,
}: UseStaffTenantRolesListArgs) => {
	const queryClient = useQueryClient();
	const [deleteTarget, setDeleteTarget] = useState<StaffTenantRoleRow | null>(
		null,
	);
	const [shouldRedirectToLogout, setShouldRedirectToLogout] = useState(false);
	const deleteRole = useDeleteStaffTenantRoleMutation();
	const [isEditFormDirty, setIsEditFormDirty] = useState(false);

	const isCreateDrawerOpen = search.new === 1;
	const editRoleId = search.edit;

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
			// belt-and-braces: without it, "New role" while the edit drawer
			// is open would produce `?new=1&edit=<id>`, which canonicalizes
			// straight back to `?edit=<id>` and makes the button a no-op.
			edit: isOpen ? undefined : search.edit,
		});
	};

	const onCreateSaved = (roleId: string): void => {
		// A successful submit must never be blocked by the parent's own nav
		// guard reading a not-yet-flushed dirty flag (W8-DRAWER).
		createDrawerNavBypassRef.current = true;

		if (roleId) {
			navigateToRole(roleId);
			return;
		}

		setCreateDrawerOpen(false);
	};

	// A PUSH, deliberately — unlike every other search write on this page. The
	// open drawer is its own history entry, so a browser Back closes it and
	// restores this list entry (same filters, same cursor page, same selection,
	// same scroll) instead of leaving the list (#972).
	//
	// This handler is handed to `makeTenantRoleColumns`, so it must stay
	// free of ref writes: the compiler treats any function that mutates a ref
	// as ref-tainted, and passing such a value anywhere during render makes it
	// skip the whole component. The bypass re-arm and PUSH bookkeeping moved
	// to the `useEffect` below, which observes the same open transition.
	const openEditDrawer = (role: StaffTenantRoleRow): void => {
		pushSearch({
			...search,
			edit: role.id,
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

	const setTypeFilter = (next: StaffTenantRoleTypeFilter | undefined): void => {
		applySearch({
			...search,
			is_full_access: next === undefined ? undefined : next === 'true',
			cursor: undefined,
		});
	};

	const setView = (next: StaffTenantRolesViewMode): void => {
		applySearch({
			...search,
			view: next === 'table' ? 'table' : undefined,
		});
	};

	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: ROLES_DEFAULT_SORT,
		defaultSize: ROLES_DEFAULT_SIZE,
		cursorResetKey: `${tenantId}:${search.is_full_access ?? ''}`,
	});
	const queries = tenantRolesListQueries({ tenantId, search });
	const detailsQuery = useStaffTenantDetailsQuery(queries.details.variables, {
		enabled: tenantId.length > 0,
	});
	const rolesQuery = useStaffTenantRolesQuery(
		{
			...queries.roles.variables,
			// The cursor lives in React state: the loader warms the first page.
			cursor: controller.apiVariables.cursor,
		},
		{
			enabled: tenantId.length > 0,
		},
	);

	const rows = toStaffTenantRoleRows(rolesQuery.data?.data);
	const selection = useRowSelection(rows.map((row) => row.id));

	// The drawer edits a row this list already carries — its whole contract is
	// `{ id, name, description, icon?, tone? }`, every field of which is on the
	// row — so opening it costs no extra request. An `?edit=<id>` that names no
	// loaded row (a stale bookmark, or a role filtered off the current page)
	// simply leaves the drawer shut rather than inventing a role to show.
	// The full-access system role is never editable, so an `?edit=<id>` naming
	// it is an impossible state too: it leaves the drawer shut instead of
	// opening one the API would reject (the row menu already hides Edit).
	const editingRole = editRoleId
		? rows.find((row) => row.id === editRoleId && row.isFullAccess !== true)
		: undefined;
	const isEditDrawerOpen = editingRole !== undefined;
	// Keep the last edited row so the drawer stays mounted through its close
	// animation, exactly as the always-mounted drawer on the detail page does.
	// State (not a ref): the render must read this value, and a ref read
	// during render makes React Compiler skip the whole component.
	const [lastEditedRole, setLastEditedRole] =
		useState<StaffTenantRoleRow | null>(null);
	useEffect(() => {
		if (editingRole) {
			setLastEditedRole(editingRole);
		}
	}, [editingRole]);
	const editDrawerRole = editingRole ?? lastEditedRole;

	// The open transition (no `?edit=<id>` -> one) re-arms the close guard and
	// records that the drawer URL was a PUSH entry — the bookkeeping that used
	// to live inside `openEditDrawer`. Doing it in an effect keeps
	// `openEditDrawer` free of ref writes, which keeps it untainted for the
	// compiler when it is handed to `makeTenantRoleColumns`. Every run of
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
				(next.search as StaffTenantRolesSearchParams).edit === editRoleId;

			return !staysOnOpenDrawer;
		},
		withResolver: true,
	});
	const view = parseStaffTenantRolesViewMode(search.view);

	// tenants-r6-F2: freeze the destructive selection target set — cancel a
	// pending search commit the moment selection mode starts (mirrors
	// invitations/index.tsx, staff-users.tsx, staff/roles.tsx); the type
	// filter trigger below is disabled for the same reason.
	const { resetDraftToCommitted } = controller.search;
	useEffect(() => {
		if (selection.isSelectionMode) {
			resetDraftToCommitted();
		}
	}, [selection.isSelectionMode, resetDraftToCommitted]);

	// `onEditRequest` is a plain function handed straight to
	// `makeTenantRoleColumns` — no manual memoisation anywhere. The React
	// Compiler caches the columns per value, so identity churn costs nothing,
	// and there is no latest-callback ref indirection to read during render.
	const onEditRequest = (role: StaffTenantRoleRow): void => {
		openEditDrawer(role);
	};

	const columns = makeTenantRoleColumns(
		tenantId,
		t,
		onEditRequest,
		setDeleteTarget,
	);

	const hasActiveSearch = Boolean(
		controller.search.committed || search.is_full_access !== undefined,
	);
	const bodyState = resolveTableBodyState({
		isPending: rolesQuery.isPending,
		isError: rolesQuery.isError,
		rowCount: rows.length,
		hasActiveSearch,
	});

	const toggleCardSelection = (roleId: string): void => {
		const visibleIds = rows.map((row) => row.id);
		const currentlySelected = new Set(
			visibleIds.filter((id) => selection.rowSelection[id]),
		);

		if (currentlySelected.has(roleId)) {
			currentlySelected.delete(roleId);
		} else {
			currentlySelected.add(roleId);
		}

		selection.onSelectionChange(currentlySelected);
	};

	const handleDelete = async () => {
		if (!deleteTarget) {
			return;
		}

		try {
			await deleteRole.mutateAsync({
				tenantId,
				roleId: deleteTarget.id,
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
		deleteRole,
		deleteTarget,
		detailsQuery,
		drawerBlocker,
		editDrawerRole,
		handleDelete,
		hasActiveSearch,
		isCreateDrawerOpen,
		isEditDrawerOpen,
		onCreateSaved,
		onEditRequest,
		rolesQuery,
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
