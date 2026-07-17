import {
	IconAlertCircle,
	IconArrowLeft,
	IconSearchOff,
	IconUsers,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useBlocker } from '@tanstack/react-router';
import {
	type ReactNode,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { LoadingSpinner } from '~/components/ui/loading-spinner';
import { StateView } from '~/components/ui/state-view';
import {
	buildStaffTenantPermissionCatalogGroups,
	toStaffTenantProfileDetails,
	toStaffTenantProfileMembers,
	toStaffTenantProfilePermissionKeys,
	useDeleteStaffTenantProfileMutation,
	useStaffTenantPermissionCatalogQuery,
	useStaffTenantProfileDetailsQuery,
	useStaffTenantProfilePermissionKeysQuery,
	useStaffTenantProfileUsersQuery,
} from '~/lib/query/staff-tenant-profiles';
import {
	invalidateAllStaffTenantScopes,
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';
import { useUiStore } from '~/lib/store/ui-store';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

import {
	BackToTenantsLink,
	MALFORMED_ID_TRANSLATION_KEY,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantRetryActions,
} from '../_tenant-details-shell';
import {
	parseProfileDetailsSearchParams,
	type ProfileDetailsSearchParamInput,
	type ProfileDetailsSearchParams,
} from './_profile-details-search';
import { ProfileFormDrawer } from './_profile-form-drawer';
import { ProfileIdentityHeader } from './_profile-identity-header';
import { ProfileOverviewTab } from './_profile-overview-tab';
import { ProfilePermissionsTab } from './_profile-permissions-tab';
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
	const { t } = useTranslation('common');

	return (
		<div
			className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12"
			data-testid="staff-tenant-profile-details-loading"
		>
			<div className="flex items-center gap-3 text-sm text-muted-foreground">
				<LoadingSpinner />
				<span>{t('loading-tenant-profile')}</span>
			</div>
		</div>
	);
};

const MissingTenantProfileView = ({ error }: { error: unknown }) => {
	const { t } = useTranslation('common');

	return (
		<AppErrorView
			icon={<IconSearchOff aria-hidden="true" className="size-7" />}
			code={t('error-404-code')}
			title={t('tenant-profile-not-found-title')}
			description={getFailureDescription(
				error,
				t('tenant-profile-not-found-description'),
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
	const { t } = useTranslation('common');

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
			code={t('error-500-code')}
			title={t('unable-to-load-tenant-profile')}
			description={t('tenant-profile-load-error-description')}
			testId="staff-tenant-profile-details-error"
			actions={<TenantRetryActions onRetry={onRetry} />}
		/>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/profiles/$profileId',
)({
	validateSearch: (search) =>
		parseProfileDetailsSearchParams(search as ProfileDetailsSearchParamInput),
	component: StaffTenantProfileDetailsPage,
});

function StaffTenantProfileDetailsPage() {
	const { tenantId, profileId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { t, i18n } = useTranslation('common');
	const queryClient = useQueryClient();
	const [pendingDelete, setPendingDelete] = useState(false);
	const [shouldRedirectToLogout, setShouldRedirectToLogout] = useState(false);
	const isEditDrawerOpen = search.edit === 1;
	const activeTab = search.tab ?? 'overview';
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
		void navigate({
			search: (previous: ProfileDetailsSearchParams) => ({
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
			// Step-3 inline-matrix guard (independent of the edit drawer). Unsaved
			// matrix edits live only in the mounted Permissions tab, so any
			// navigation that leaves that tab — a switch to Overview/Members, a
			// sibling route, or a browser Back — would discard them; prompt there.
			// Staying on the Permissions tab (e.g. opening the edit drawer via
			// `?edit=1`, which keeps the matrix mounted) must never prompt.
			if (isPermissionsMatrixDirty) {
				const nextSearch = next.search as ProfileDetailsSearchParams;
				const leavesPermissionsTab =
					next.pathname !== current.pathname ||
					nextSearch.tab !== 'permissions';

				if (leavesPermissionsTab) {
					return true;
				}
			}

			if (
				!isEditDrawerOpen ||
				!isEditFormDirty ||
				editDrawerNavBypassRef.current
			) {
				return false;
			}

			// A tab switch stays on this exact profile route (same pathname) and
			// preserves `edit=1`, so the drawer stays open and the draft is
			// intact — a discard prompt there would be misleading. Only block
			// transitions that actually leave the open drawer (a browser Back, a
			// sibling route, or dropping `edit`).
			const staysOnOpenDrawer =
				next.pathname === current.pathname &&
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
	// Overview only needs the leading members (avatar stack + first-4 preview);
	// the full Members table (step 4) will page through the same endpoint.
	const membersQuery = useStaffTenantProfileUsersQuery(
		{ tenantId, profileId, limit: MEMBERS_PREVIEW_LIMIT },
		{
			enabled:
				tenantId.length > 0 &&
				profileId.length > 0 &&
				!tenantQuery.isPending &&
				!tenantQuery.isError,
		},
	);
	const permissionCatalogQuery = useStaffTenantPermissionCatalogQuery({});
	const deleteProfile = useDeleteStaffTenantProfileMutation();
	const tenant = toStaffTenantDetails(tenantQuery.data);
	const profile = toStaffTenantProfileDetails(detailQuery.data);
	const permissionKeys = toStaffTenantProfilePermissionKeys(
		permissionKeysQuery.data,
	);
	const members = toStaffTenantProfileMembers(membersQuery.data);
	const setBreadcrumbOverride = useUiStore(
		(state) => state.setBreadcrumbOverride,
	);

	// Publish the 4-crumb trail in a layout effect (not `useEffect`) so the
	// override is committed before the browser paints the first frame. With a
	// passive effect the app-shell paints its 3-crumb path fallback first and
	// then jumps to 4 crumbs; a layout effect gives the shell the full trail
	// from frame one (generic labels swap to entity names later without ever
	// changing the crumb count). The authed shell is client-only, so there is
	// no SSR `useLayoutEffect` warning to worry about. Publish and cleanup live
	// in ONE layout effect so there is never a passive-cleanup gap during route
	// handoff, and the dispose returned by `setBreadcrumbOverride` is
	// owner-scoped, so a superseded page cannot erase the next page's freshly
	// published trail.
	useLayoutEffect(() => {
		return setBreadcrumbOverride([
			{ label: t('tenants'), to: '/staff/tenants' },
			{
				label: tenant?.name ?? t('tenant'),
				to: '/staff/tenants/' + tenantId,
			},
			{
				label: t('profiles'),
				to: '/staff/tenants/' + tenantId + '/profiles',
			},
			{ label: profile?.name ?? t('profile') },
		]);
	}, [profile?.name, setBreadcrumbOverride, t, tenant?.name, tenantId]);
	// Stable identity across refetch re-renders — the drawer resets its form
	// whenever this prop's reference changes, so a new object literal here
	// would silently discard unsaved edits (see _profile-form-drawer.tsx).
	const permissionKeysCacheKey = permissionKeys.join(',');
	const profileFormDrawerProfile = useMemo(
		() =>
			profile === null
				? undefined
				: {
						id: profile.id,
						name: profile.name,
						description: profile.description,
						permissionKeys,
					},
		// eslint-disable-next-line react-hooks/exhaustive-deps -- permissionKeysCacheKey is the stable key, not the array identity
		[profile?.id, profile?.name, profile?.description, permissionKeysCacheKey],
	);
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
				code={t('error-500-code')}
				title={t('tenant-details-error-title')}
				description={t('tenant-response-incomplete')}
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
				code={t('error-404-code')}
				title={t('tenant-profile-not-found-title')}
				description={t('tenant-profile-payload-empty')}
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

	let activeTabContent: ReactNode;
	if (activeTab === 'overview') {
		activeTabContent = (
			<ProfileOverviewTab
				tenantId={tenantId}
				profile={profile}
				permissionKeys={permissionKeys}
				permissionGroups={permissionGroups}
				isCatalogPending={permissionCatalogQuery.isPending}
				isCatalogError={permissionCatalogQuery.isError}
				members={members}
				membersPending={membersQuery.isPending}
				membersError={membersQuery.isError}
				locale={i18n.language}
				onDeleteRequest={() => setPendingDelete(true)}
				isDeletePending={deleteProfile.isPending}
			/>
		);
	} else if (activeTab === 'permissions') {
		activeTabContent = (
			<ProfilePermissionsTab
				tenantId={tenantId}
				profileId={profileId}
				grantedKeys={permissionKeys}
				grantedRevision={permissionKeysQuery.dataUpdatedAt}
				permissionGroups={permissionGroups}
				isCatalogPending={permissionCatalogQuery.isPending}
				isCatalogError={permissionCatalogQuery.isError}
				catalogError={permissionCatalogQuery.error}
				onDirtyChange={setIsPermissionsMatrixDirty}
				onSessionExpired={() => setShouldRedirectToLogout(true)}
			/>
		);
	} else {
		activeTabContent = (
			<StateView
				icon={<IconUsers aria-hidden="true" />}
				scale="inline"
				title={t('profile-members-placeholder-title')}
				description={t('profile-members-placeholder-description')}
				testId="staff-tenant-profile-members-placeholder"
				className="py-12"
			/>
		);
	}

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
					activeTab={activeTab}
					label={t('overview')}
					tab="overview"
					tenantId={tenantId}
					profileId={profileId}
				/>
				<ProfileSectionNavLink
					activeTab={activeTab}
					count={permissionKeys.length}
					label={t('permissions')}
					tab="permissions"
					tenantId={tenantId}
					profileId={profileId}
				/>
				<ProfileSectionNavLink
					activeTab={activeTab}
					count={profile.userAccountCount}
					label={t('members')}
					tab="members"
					tenantId={tenantId}
					profileId={profileId}
				/>
			</nav>

			<ConfirmDialog
				isOpen={pendingDelete}
				title={t('delete-tenant-profile-confirm-title')}
				description={t('confirm-delete-tenant-profile-description')}
				confirmLabel={t('delete')}
				isPending={deleteProfile.isPending}
				onConfirm={() => {
					void handleDelete();
				}}
				onOpenChange={setPendingDelete}
			/>

			{activeTabContent}

			<ProfileFormDrawer
				tenantId={tenantId}
				mode="edit"
				isOpen={isEditDrawerOpen}
				profile={profileFormDrawerProfile}
				onOpenChange={setEditDrawerOpen}
				onSessionExpired={() => setShouldRedirectToLogout(true)}
				onDirtyChange={setIsEditFormDirty}
				onSaved={() => setEditDrawerOpen(false)}
			/>
			<ConfirmDialog
				isOpen={editDrawerBlocker.status === 'blocked'}
				title={t('unsaved-changes-dialog-title')}
				description={t('unsaved-changes-dialog-description')}
				confirmLabel={t('leave-page')}
				cancelLabel={t('cancel')}
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
