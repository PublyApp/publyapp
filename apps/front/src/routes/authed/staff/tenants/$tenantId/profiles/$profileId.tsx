import { IconAlertCircle, IconSearchOff } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { staffTenantProfileDetailsQueryOptions } from '~/lib/query/staff-tenant-profiles';
import { staffTenantDetailsQueryOptions } from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	BackToTenantsLink,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantRetryActions,
} from '../_tenant-details-shell';
import { staffTenantProfileCrumbsBase } from './$profileId/_crumbs';
import type { StaffTenantProfileDetailsContextValue } from './$profileId/_details-context';
import {
	ProfileDetailsLoading,
	TenantProfileDetailsError,
} from './$profileId/_details-error-views';
import { ProfileDetailsView } from './$profileId/_profile-details-view';
import {
	PROFILE_SECTION_ROUTES,
	type ProfileSection,
} from './$profileId/_sections';
import { useStaffTenantProfileDetails } from './$profileId/_use-profile-details-state';
import {
	parseProfileDetailsSearchParams,
	type ProfileDetailsSearchParamInput,
	type ProfileDetailsSearchParams,
} from './_profile-details-search';

const StaffTenantProfileDetailsPage = () => {
	const { tenantId, profileId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { t, i18n } = useTranslation('staff-tenant-profiles');

	// Both URL writers wrap `Route.useNavigate()` in `useCallback` and are
	// invoked exclusively from event handlers downstream — never during
	// render (`react-doctor/navigate-in-render`).
	const applyEditFlag = useCallback(
		(section: ProfileSection, isOpen: boolean): void => {
			void navigate({
				to: PROFILE_SECTION_ROUTES[section],
				params: { tenantId, profileId },
				search: (
					previous: ProfileDetailsSearchParams,
				): ProfileDetailsSearchParams => ({
					...previous,
					edit: isOpen ? 1 : undefined,
				}),
				replace: true,
			});
		},
		[navigate, tenantId, profileId],
	);

	const navigateToProfilesList = useCallback((): void => {
		void navigate({
			to: '/staff/tenants/$tenantId/profiles',
			params: { tenantId },
		});
	}, [navigate, tenantId]);

	const details = useStaffTenantProfileDetails({
		tenantId,
		profileId,
		search,
		locale: i18n.language,
		applyEditFlag,
		navigateToProfilesList,
	});
	const {
		detailQuery,
		membersQuery,
		permissionCatalogQuery,
		permissionKeys,
		permissionKeysQuery,
		profile,
		tenant,
		tenantQuery,
	} = details;

	if (details.shouldRedirectToLogout) {
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

	// react-doctor: memoizing this literal would require hoisting it above the
	// early returns, breaking conditional hook order on this page. The Provider
	// re-renders only with this page, whose consumers read the same queries.
	const detailsContextValue: StaffTenantProfileDetailsContextValue = {
		tenantId,
		profileId,
		profile,
		permissionKeys,
		permissionKeysRevision: details.permissionKeysCacheSnapshot?.revision ?? 0,
		permissionGroups: details.permissionGroups,
		isCatalogPending: permissionCatalogQuery.isPending,
		isCatalogError: permissionCatalogQuery.isError,
		catalogError: permissionCatalogQuery.error,
		locale: i18n.language,
		members: details.members,
		membersPending: membersQuery.isPending,
		membersError: membersQuery.isError,
		isDeletePending: details.deleteProfile.isPending,
		onDeleteRequest: () => details.setPendingDelete(true),
		onSessionExpired: () => details.setShouldRedirectToLogout(true),
		onPermissionsDirtyChange: details.setIsPermissionsMatrixDirty,
	};

	return (
		<ProfileDetailsView
			tenantId={tenantId}
			profileId={profileId}
			tenant={tenant}
			profile={profile}
			permissionKeys={permissionKeys}
			activeSection={details.activeSection}
			detailsContextValue={detailsContextValue}
			pendingDelete={details.pendingDelete}
			isDeletePending={details.deleteProfile.isPending}
			onDeleteConfirm={() => {
				void details.handleDelete();
			}}
			onPendingDeleteChange={details.setPendingDelete}
			isEditDrawerOpen={details.isEditDrawerOpen}
			onEditDrawerOpenChange={details.setEditDrawerOpen}
			onEditDirtyChange={details.setIsEditFormDirty}
			onSessionExpired={() => details.setShouldRedirectToLogout(true)}
			blockerStatus={details.editDrawerBlocker.status}
			onBlockerProceed={details.editDrawerBlocker.proceed}
			onBlockerReset={details.editDrawerBlocker.reset}
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
	/**
	 * #851 — the one sanctioned client `loader` (see conventions.md §Rendering
	 * Strategy). It awaits the SAME query options the page body queries, so
	 * both entity names are in TanStack Query's cache before the first frame:
	 * the shell's entity crumbs paint their real names immediately, with no
	 * skeleton phase on a cold deep link. The component-side `useQuery` hooks
	 * below are untouched — they dedupe against this warmed cache.
	 */
	loader: async ({ context, params }) => {
		await Promise.all([
			context.queryClient.ensureQueryData({
				queryKey: staffTenantDetailsQueryOptions.queryKey({
					tenantId: params.tenantId,
				}),
				queryFn: () =>
					staffTenantDetailsQueryOptions.fetcher({
						tenantId: params.tenantId,
					}),
			}),
			context.queryClient.ensureQueryData({
				queryKey: staffTenantProfileDetailsQueryOptions.queryKey({
					tenantId: params.tenantId,
					profileId: params.profileId,
				}),
				queryFn: () =>
					staffTenantProfileDetailsQueryOptions.fetcher({
						tenantId: params.tenantId,
						profileId: params.profileId,
					}),
			}),
		]);
	},
	pendingComponent: ProfileDetailsLoading,
	component: StaffTenantProfileDetailsPage,
});
