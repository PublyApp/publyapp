import {
	IconAlertCircle,
	IconArrowLeft,
	IconSearchOff,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import {
	createFileRoute,
	Link,
	Outlet,
	useBlocker,
	useRouterState,
} from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { LoadingSpinner } from '~/components/ui/loading-spinner';
import {
	buildStaffTenantPermissionCatalogGroups,
	getStaffTenantProfilePermissionKeysCacheSnapshot,
	toStaffTenantProfileDetails,
	toStaffTenantProfileMemberRows,
	toStaffTenantProfilePermissionKeys,
	useDeleteStaffTenantProfileMutation,
	useStaffTenantPermissionCatalogQuery,
	useStaffTenantProfileDetailsQuery,
	useStaffTenantProfilePermissionKeysQuery,
	useStaffTenantProfileMembersQuery,
} from '~/lib/query/staff-tenant-profiles';
import {
	invalidateAllStaffTenantScopes,
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

import {
	BackToTenantsLink,
	MALFORMED_ID_TRANSLATION_KEY,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantRetryActions,
} from '../_tenant-details-shell';
import { staffTenantProfileCrumbsBase } from './$profileId/_crumbs';
import {
	StaffTenantProfileDetailsContext,
	type StaffTenantProfileDetailsContextValue,
} from './$profileId/_details-context';
import {
	getActiveProfileSection,
	isProfileSectionPathname,
	PROFILE_SECTION_ROUTES,
	profileSectionPathname,
} from './$profileId/_sections';
import {
	parseProfileDetailsSearchParams,
	type ProfileDetailsSearchParamInput,
	type ProfileDetailsSearchParams,
} from './_profile-details-search';
import { ProfileEditDetailsDrawer } from './_profile-edit-details-drawer';
import { ProfileIdentityHeader } from './_profile-identity-header';
import { ProfileSectionNavLink } from './_profile-section-nav-link';
import { ProfileTenantBand } from './_profile-tenant-band';

// Members shown in the Overview avatar stack / preview before "View all".
const MEMBERS_PREVIEW_LIMIT = 5;

const isProblemStatus = (
	error: unknown,
	status: number,
	translationKey?: string,
): boolean => {
	const failure = toApiFailure(error);

	if (failure.kind !== 'problem' || failure.status !== status) {
		return false;
	}

	return (
		translationKey === undefined || failure.translationKey === translationKey
	);
};

const getFailureDescription = (error: unknown, fallback: string): string => {
	const failure = toApiFailure(error);

	if (failure.kind === 'problem' && failure.detail) {
		return failure.detail;
	}

	return fallback;
};

const ProfileDetailsLoading = () => {
	const { t } = useTranslation('staff-tenant-profiles');

	return (
		<div
			className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12"
			data-testid="staff-tenant-profile-details-loading"
		>
			<div className="flex items-center gap-3 text-sm text-muted-foreground">
				<LoadingSpinner />
				<span>{t('common:loading-tenant-profile')}</span>
			</div>
		</div>
	);
};

const MissingTenantProfileView = ({ error }: { error: unknown }) => {
	const { t } = useTranslation('staff-tenant-profiles');

	return (
		<AppErrorView
			icon={<IconSearchOff aria-hidden="true" className="size-7" />}
			code={t('common:error-404-code')}
			title={t('common:tenant-profile-not-found-title')}
			description={getFailureDescription(
				error,
				t('common:tenant-profile-not-found-description'),
			)}
			testId="staff-tenant-profile-details-not-found"
			actions={<BackToTenantsLink />}
		/>
	);
};

const TenantProfileDetailsError = ({
	error,
	onRetry,
}: {
	error: unknown;
	onRetry: () => void;
}) => {
	const { t } = useTranslation('staff-tenant-profiles');

	if (
		isProblemStatus(error, 404) ||
		isProblemStatus(error, 400, MALFORMED_ID_TRANSLATION_KEY)
	) {
		return <MissingTenantProfileView error={error} />;
	}

	if (isProblemStatus(error, 403)) {
		return <View403 />;
	}

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('common:error-500-code')}
			title={t('common:unable-to-load-tenant-profile')}
			description={t('common:tenant-profile-load-error-description')}
			testId="staff-tenant-profile-details-error"
			actions={<TenantRetryActions onRetry={onRetry} />}
		/>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/profiles/$profileId',
)({
	staticData: {
		i18nNamespaces: ['staff-tenant-profiles'],
		// Always matched alongside an index/permissions/members child (never
		// the deepest match on its own — see `deriveBreadcrumbTrail`), but the
		// contract requires every route to declare its own trail. The overview
		// base is the correct value for this route's own path.
		crumbs: staffTenantProfileCrumbsBase,
	},
	validateSearch: (search) =>
		parseProfileDetailsSearchParams(search as ProfileDetailsSearchParamInput),
	component: StaffTenantProfileDetailsPage,
});

function StaffTenantProfileDetailsPage() {
	const { tenantId, profileId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { t, i18n } = useTranslation('staff-tenant-profiles');
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
		// `to` must name the section currently on screen. This route is a
		// layout now, so a `to`-less navigate resolves against the LAYOUT's own
		// path: toggling the drawer from Permissions or Members would drop the
		// visitor back onto Overview, and trip the dirty-matrix guard on the
		// way out.
		void navigate({
			to: PROFILE_SECTION_ROUTES[activeSection],
			params: { tenantId, profileId },
			search: (
				previous: ProfileDetailsSearchParams,
			): ProfileDetailsSearchParams => ({
				...previous,
				edit: isOpen ? 1 : undefined,
			}),
			replace: true,
		});
	};

	// The edit drawer's open flag lives in the URL (`?edit=1`); a browser
	// Back or a sibling-route navigation changes/unmounts it without ever
	// calling the drawer's own `onOpenChange` close guard, discarding a dirty
	// edit draft silently (tenants-r1-F2).
	const editDrawerBlocker = useBlocker({
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
		language: i18n.language,
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
	// above) and derived by the shell from `useMatches()` (#973). The entity
	// crumbs reuse these same query options, so TanStack Query dedupes with
	// `tenantQuery`/`detailQuery` above.
	const permissionGroups = buildStaffTenantPermissionCatalogGroups(
		permissionCatalogQuery.data?.additionalData,
	);
	const invalidatePermissionQueries = () =>
		invalidateAllStaffTenantScopes(queryClient);

	if (shouldRedirectToLogout) {
		return <LogoutRedirect />;
	}

	if (tenantQuery.isPending) {
		return <TenantDetailsLoading />;
	}

	if (tenantQuery.isError) {
		if (shouldLogoutForFailure(tenantQuery.error)) {
			return <LogoutRedirect />;
		}

		return (
			<TenantDetailsError
				error={tenantQuery.error}
				onRetry={() => void tenantQuery.refetch()}
			/>
		);
	}

	if (!tenant) {
		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code={t('common:error-500-code')}
				title={t('common:tenant-details-error-title')}
				description={t('common:tenant-response-incomplete')}
				testId="staff-tenant-details-error"
				actions={
					<TenantRetryActions onRetry={() => void tenantQuery.refetch()} />
				}
			/>
		);
	}

	if (
		(detailQuery.isError && shouldLogoutForFailure(detailQuery.error)) ||
		(permissionKeysQuery.isError &&
			shouldLogoutForFailure(permissionKeysQuery.error)) ||
		(membersQuery.isError && shouldLogoutForFailure(membersQuery.error)) ||
		(permissionCatalogQuery.isError &&
			shouldLogoutForFailure(permissionCatalogQuery.error))
	) {
		return <LogoutRedirect />;
	}

	if (detailQuery.isPending || permissionKeysQuery.isPending) {
		return <ProfileDetailsLoading />;
	}

	if (detailQuery.isError) {
		return (
			<TenantProfileDetailsError
				error={detailQuery.error}
				onRetry={() => void detailQuery.refetch()}
			/>
		);
	}

	if (permissionKeysQuery.isError) {
		return (
			<TenantProfileDetailsError
				error={permissionKeysQuery.error}
				onRetry={() => void permissionKeysQuery.refetch()}
			/>
		);
	}

	if (!profile) {
		return (
			<AppErrorView
				icon={<IconSearchOff aria-hidden="true" className="size-7" />}
				code={t('common:error-404-code')}
				title={t('common:tenant-profile-not-found-title')}
				description={t('common:tenant-profile-payload-empty')}
				testId="staff-tenant-profile-details-not-found"
				actions={<BackToTenantsLink />}
			/>
		);
	}

	const handleDelete = async () => {
		if (profile.isDefault) {
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
		void navigate({
			to: '/staff/tenants/$tenantId/profiles',
			params: { tenantId },
		});
	};

	const detailsContextValue: StaffTenantProfileDetailsContextValue = {
		tenantId,
		profileId,
		profile,
		permissionKeys,
		permissionKeysRevision: permissionKeysCacheSnapshot?.revision ?? 0,
		permissionGroups,
		isCatalogPending: permissionCatalogQuery.isPending,
		isCatalogError: permissionCatalogQuery.isError,
		catalogError: permissionCatalogQuery.error,
		locale: i18n.language,
		members,
		membersPending: membersQuery.isPending,
		membersError: membersQuery.isError,
		isDeletePending: deleteProfile.isPending,
		onDeleteRequest: () => setPendingDelete(true),
		onSessionExpired: () => setShouldRedirectToLogout(true),
		onPermissionsDirtyChange: setIsPermissionsMatrixDirty,
	};

	return (
		<div
			className="publy-detail-page flex w-full flex-col gap-5"
			data-testid="staff-tenant-profile-details-page"
		>
			<Link
				to="/staff/tenants/$tenantId/profiles"
				params={{ tenantId }}
				className="publy-back-link"
			>
				<IconArrowLeft aria-hidden="true" className="size-3" />
				{t('back-to-tenant-profiles', { name: tenant.name })}
			</Link>

			<ProfileTenantBand tenant={tenant} tenantId={tenantId} />

			<ProfileIdentityHeader
				profile={profile}
				permissionCount={permissionKeys.length}
				onEdit={() => setEditDrawerOpen(true)}
			/>

			<nav
				aria-label={t('profile-sections')}
				className="flex flex-wrap gap-1 border-b border-border"
				data-testid="staff-tenant-profile-tabs"
			>
				<ProfileSectionNavLink
					activeSection={activeSection}
					label={t('common:overview')}
					section="overview"
					tenantId={tenantId}
					profileId={profileId}
				/>
				<ProfileSectionNavLink
					activeSection={activeSection}
					count={permissionKeys.length}
					label={t('common:permissions')}
					section="permissions"
					tenantId={tenantId}
					profileId={profileId}
				/>
				<ProfileSectionNavLink
					activeSection={activeSection}
					count={profile.userAccountCount}
					label={t('common:members')}
					section="members"
					tenantId={tenantId}
					profileId={profileId}
				/>
			</nav>

			<ConfirmDialog
				isOpen={pendingDelete}
				title={t('common:delete-tenant-profile-confirm-title')}
				description={t('common:confirm-delete-tenant-profile-description')}
				confirmLabel={t('common:delete')}
				isPending={deleteProfile.isPending}
				onConfirm={() => {
					void handleDelete();
				}}
				onOpenChange={setPendingDelete}
			/>

			<StaffTenantProfileDetailsContext.Provider value={detailsContextValue}>
				<Outlet />
			</StaffTenantProfileDetailsContext.Provider>

			<ProfileEditDetailsDrawer
				tenantId={tenantId}
				isOpen={isEditDrawerOpen}
				profile={profile}
				onOpenChange={setEditDrawerOpen}
				onSessionExpired={() => setShouldRedirectToLogout(true)}
				onDirtyChange={setIsEditFormDirty}
				onSaved={() => setEditDrawerOpen(false)}
			/>
			<ConfirmDialog
				isOpen={editDrawerBlocker.status === 'blocked'}
				title={t('common:unsaved-changes-dialog-title')}
				description={t('common:unsaved-changes-dialog-description')}
				confirmLabel={t('common:leave-page')}
				cancelLabel={t('common:cancel')}
				tone="danger"
				onConfirm={() => editDrawerBlocker.proceed?.()}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						editDrawerBlocker.reset?.();
					}
				}}
			/>
		</div>
	);
}
