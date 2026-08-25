import { useQueryClient } from '@tanstack/react-query';
import { useBlocker, useRouterState } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import {
	buildStaffTenantPermissionCatalogGroups,
	getStaffTenantProfilePermissionKeysCacheSnapshot,
	toStaffTenantProfileDetails,
	toStaffTenantProfileMemberRows,
	toStaffTenantProfilePermissionKeys,
	useDeleteStaffTenantProfileMutation,
	useStaffTenantPermissionCatalogQuery,
	useStaffTenantProfileDetailsQuery,
	useStaffTenantProfileMembersQuery,
	useStaffTenantProfilePermissionKeysQuery,
} from '~/lib/query/staff-tenant-profiles';
import {
	invalidateAllStaffTenantScopes,
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import type { ProfileDetailsSearchParams } from '../_profile-details-search';
import {
	getActiveProfileSection,
	isProfileSectionPathname,
	profileSectionPathname,
	type ProfileSection,
} from './_sections';

// Members shown in the Overview avatar stack / preview before "View all".
const MEMBERS_PREVIEW_LIMIT = 5;

type UseStaffTenantProfileDetailsArgs = {
	tenantId: string;
	profileId: string;
	search: ProfileDetailsSearchParams;
	locale: string;
	/** Replace-navigate to `section`, setting or clearing the `?edit=1` flag. */
	applyEditFlag: (section: ProfileSection, isOpen: boolean) => void;
	/** Navigate back to the tenant's profiles list after a successful delete. */
	navigateToProfilesList: () => void;
};

/**
 * Everything the tenant-profile detail layout resolves before it renders: the
 * active section, the four queries it owns, the delete flow, and the shared
 * unsaved-work navigation guard covering both the edit drawer and the inline
 * permission matrix. Split out of the route file for
 * `react-doctor/no-giant-component`; semantics are unchanged.
 */
export const useStaffTenantProfileDetails = ({
	tenantId,
	profileId,
	search,
	locale,
	applyEditFlag,
	navigateToProfilesList,
}: UseStaffTenantProfileDetailsArgs) => {
	const queryClient = useQueryClient();
	const [pendingDelete, setPendingDelete] = useState(false);
	const [shouldRedirectToLogout, setShouldRedirectToLogout] = useState(false);
	const isEditDrawerOpen = search.edit === 1;
	// Sections are path segments (#977), so the active one is read off the
	// URL's pathname rather than a `?tab=` param.
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const activeSection = getActiveProfileSection(pathname);
	const permissionsPathname = profileSectionPathname(
		tenantId,
		profileId,
		'permissions',
	);
	const [isEditFormDirty, setIsEditFormDirty] = useState(false);
	// The inline Permissions matrix stages edits locally; it reports its dirty
	// state up here so the page-level nav guard (below) can prompt before a tab
	// switch / Back discards them.
	const [isPermissionsMatrixDirty, setIsPermissionsMatrixDirty] =
		useState(false);
	// `onDirtyChange(false)` (called by the drawer right before an
	// app-initiated close/submit navigation) is an async React state update —
	// a `navigate()` fired synchronously right after it still sees the old
	// (dirty) render's `shouldBlockFn` closure. This ref is set synchronously
	// by every app-initiated close/navigate path below so the guard never
	// blocks its own transition (W8-DRAWER; only a real browser Back or
	// sibling-route nav should ever trip it).
	const editDrawerNavBypassRef = useRef(false);
	const setEditDrawerOpen = (isOpen: boolean): void => {
		// Opening re-arms the guard for the new draft; every close here is
		// either a not-dirty close or a discard the drawer already confirmed
		// (including the successful-save close via `onSaved`).
		editDrawerNavBypassRef.current = !isOpen;
		// The target must name the section currently on screen. This route is a
		// layout now, so a `to`-less navigate resolves against the LAYOUT's own
		// path: toggling the drawer from Permissions or Members would drop the
		// visitor back onto Overview, and trip the dirty-matrix guard on the
		// way out.
		applyEditFlag(activeSection, isOpen);
	};

	// The two places this page can be holding work the user has not saved. It
	// is deliberately NOT the same expression as `shouldBlockFn` below: that
	// one answers "does THIS in-app transition discard something", which needs
	// to know where you are going; a tab close or reload discards everything,
	// so it only needs to know whether there is anything at all.
	//
	// `editDrawerNavBypassRef` is deliberately not consulted either — it exists
	// to stop the guard blocking the app's OWN navigation, and a browser unload
	// is never that.
	const hasUnsavedWork =
		isPermissionsMatrixDirty || (isEditDrawerOpen && isEditFormDirty);

	// The edit drawer's open flag lives in the URL (`?edit=1`); a browser
	// Back or a sibling-route navigation changes/unmounts it without ever
	// calling the drawer's own `onOpenChange` close guard, discarding a dirty
	// edit draft silently (tenants-r1-F2).
	const editDrawerBlocker = useBlocker({
		// `useBlocker` defaults this to `true`, which arms the browser's native
		// leave-site prompt for the whole lifetime of the route — a clean
		// Overview page would nag on every reload or tab close with nothing to
		// lose. Registering it only when there IS something to lose keeps the
		// prompt meaningful (a prompt that always fires is one users learn to
		// dismiss without reading).
		enableBeforeUnload: hasUnsavedWork,
		shouldBlockFn: ({ current, next }) => {
			// Step-3 inline-matrix guard (independent of the edit drawer).
			// Unsaved matrix edits live only in the mounted Permissions ROUTE,
			// so since #977 "leaves the Permissions tab" is exactly "the
			// pathname stops being the Permissions pathname" — a switch to
			// Overview/Members, a sibling route, and a browser Back all change
			// it. Staying on that pathname (opening or closing the edit drawer
			// via `?edit=1`, a search-only change) keeps the matrix mounted and
			// must never prompt.
			if (
				isPermissionsMatrixDirty &&
				current.pathname === permissionsPathname &&
				next.pathname !== permissionsPathname
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

			// The edit drawer is hosted by this LAYOUT route, so a section
			// switch keeps it mounted with its draft intact — a discard prompt
			// there would be misleading. Only block transitions that actually
			// leave the open drawer: a pathname outside this profile's own
			// sections (a sibling route such as `/users`, `/edit`, the profiles
			// list, or a browser Back), or one that drops `edit`.
			const staysOnOpenDrawer =
				isProfileSectionPathname(next.pathname, tenantId, profileId) &&
				(next.search as ProfileDetailsSearchParams).edit === 1;

			return !staysOnOpenDrawer;
		},
		withResolver: true,
	});

	const tenantQuery = useStaffTenantDetailsQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);
	const detailQuery = useStaffTenantProfileDetailsQuery(
		{ tenantId, profileId },
		{
			enabled:
				tenantId.length > 0 &&
				profileId.length > 0 &&
				!tenantQuery.isPending &&
				!tenantQuery.isError,
		},
	);
	const permissionKeysQuery = useStaffTenantProfilePermissionKeysQuery(
		{ tenantId, profileId },
		{
			enabled:
				tenantId.length > 0 &&
				profileId.length > 0 &&
				!tenantQuery.isPending &&
				!tenantQuery.isError,
		},
	);
	// Overview only needs the leading members (avatar stack + first-4 preview).
	// It uses the same canonical offset-paginated endpoint as the full Members tab.
	const membersQuery = useStaffTenantProfileMembersQuery(
		{
			tenantId,
			profileId,
			pageIndex: 0,
			size: MEMBERS_PREVIEW_LIMIT,
			sortId: 'created_at',
			sortOrder: 'desc',
		},
		{
			enabled:
				activeSection === 'overview' &&
				tenantId.length > 0 &&
				profileId.length > 0 &&
				!tenantQuery.isPending &&
				!tenantQuery.isError,
		},
	);
	const permissionCatalogQuery = useStaffTenantPermissionCatalogQuery({
		language: locale,
	});
	const deleteProfile = useDeleteStaffTenantProfileMutation();
	const tenant = toStaffTenantDetails(tenantQuery.data);
	const profile = toStaffTenantProfileDetails(detailQuery.data);
	const permissionKeys = toStaffTenantProfilePermissionKeys(
		permissionKeysQuery.data,
	);
	const permissionKeysCacheSnapshot =
		getStaffTenantProfilePermissionKeysCacheSnapshot(queryClient, {
			tenantId,
			profileId,
		});
	const members = toStaffTenantProfileMemberRows(membersQuery.data?.users);
	// The breadcrumb trail is no longer published imperatively — it is
	// declared on this route's `staticData.crumbs` (see the `Route` options
	// in the route file) and derived by the shell from `useMatches()` (#973).
	// The entity crumbs reuse these same query options, so TanStack Query
	// dedupes with `tenantQuery`/`detailQuery` above.
	const permissionGroups = buildStaffTenantPermissionCatalogGroups(
		permissionCatalogQuery.data?.additionalData,
	);
	const invalidatePermissionQueries = () =>
		invalidateAllStaffTenantScopes(queryClient);

	const handleDelete = async () => {
		if (!profile || profile.isDefault) {
			return;
		}

		try {
			await deleteProfile.mutateAsync({ tenantId, profileId });
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldRedirectToLogout(true);
			}
			setPendingDelete(false);
			return;
		}

		setPendingDelete(false);
		await invalidatePermissionQueries();
		navigateToProfilesList();
	};

	return {
		activeSection,
		deleteProfile,
		detailQuery,
		editDrawerBlocker,
		handleDelete,
		isEditDrawerOpen,
		members,
		membersQuery,
		pendingDelete,
		permissionCatalogQuery,
		permissionGroups,
		permissionKeys,
		permissionKeysCacheSnapshot,
		permissionKeysQuery,
		profile,
		setEditDrawerOpen,
		setIsEditFormDirty,
		setIsPermissionsMatrixDirty,
		setPendingDelete,
		setShouldRedirectToLogout,
		shouldRedirectToLogout,
		tenant,
		tenantQuery,
	};
};
