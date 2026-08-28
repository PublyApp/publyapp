import { IconAlertCircle, IconSearchOff } from '@tabler/icons-react';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import { staffTenantProfileDetailsQueryOptions } from '~/lib/query/staff-tenant-profiles';
import { staffTenantDetailsQueryOptions } from '~/lib/query/staff-tenants';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import {
	BackToTenantsLink,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantRetryActions,
} from '../_tenant-details-shell';
import { staffTenantProfileCrumbsBase } from './$profileId/_crumbs';
import {
	MissingTenantProfileView,
	ProfileDetailsLoading,
	TenantProfileDetailsError,
} from './$profileId/_details-error-views';
import {
	classifyProfileDetailsFailure,
	type ProfileDetailsErrorSurface,
} from './$profileId/_profile-details-error-classifier';
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

/**
 * #851 round 2 — the route's own loader-error surface. The awaited loader
 * rejects on 404/403/500 (`queryClient.query` surfaces the Kiota problem
 * pipeline), and without this boundary a loader throw short-circuits the
 * route render and the parent `_authed-layout` boundary takes over — moving
 * 404/500 UX off the route's own designed views onto generic ones.
 *
 * It resolves the failure through the SAME classifier the page body's error
 * path uses (`classifyProfileDetailsFailure`) and reuses the route's existing
 * error views verbatim:
 *
 * - 404 (or malformed-id 400) → `MissingTenantProfileView`
 * - 403 → `View403`
 * - any other recognizable API failure (500, network) →
 *   `TenantProfileDetailsError` + `TenantRetryActions`, whose retry
 *   invalidates the router so the loader (and the query cache it warmed)
 *   re-runs
 * - 401 → `LogoutRedirect`, matching the page body's own 401 handling and
 *   the repo-wide "only 401 logs out" invariant
 * - anything UNCLASSIFIABLE (no API-failure shape at all — a programming
 *   error, not a server answer) is RETHROWN so the parent layout boundary
 *   owns it loudly instead of being masked behind a "not found" view.
 */
const ProfileRouteErrorBoundary = ({
	error,
	reset,
}: {
	error: unknown;
	reset: () => void;
}) => {
	const router = useRouter();

	if (shouldLogoutForFailure(error)) {
		return <LogoutRedirect />;
	}

	const surface: ProfileDetailsErrorSurface =
		classifyProfileDetailsFailure(error);

	if (surface === 'unclassified') {
		throw error;
	}

	if (surface === 'not-found') {
		return <MissingTenantProfileView error={error} />;
	}

	if (surface === 'forbidden') {
		return <View403 />;
	}

	return (
		<TenantProfileDetailsError
			error={error}
			onRetry={() => {
				reset();
				void router.invalidate();
			}}
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
	loader: async ({ context, params }) => {
		// #851 round 3 (A3 fix): the migration from ensureQueryData to
		// query({staleTime:'static'}) eliminated the background revalidation of
		// cached loader data that ensureQueryData provided via prefetchQuery.
		// To preserve that behavior, we now use query() for the initial fetch
		// (which propagates errors to the error boundary) followed by
		// prefetchQuery() to trigger background revalidation of stale cached
		// data — matching the old ensureQueryData semantics.
		await Promise.all([
			context.queryClient.query({
				queryKey: staffTenantDetailsQueryOptions.queryKey({
					tenantId: params.tenantId,
				}),
				queryFn: () =>
					staffTenantDetailsQueryOptions.fetcher({
						tenantId: params.tenantId,
					}),
			}),
			context.queryClient.query({
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

		// #851 round 3 (A3 fix): background revalidation of the cached data the
		// initial query() just settled. With the default `staleTime: 0`, that
		// data is immediately stale, so these fire-and-forget prefetchQuery()
		// calls each issue a background refetch — exactly the behaviour
		// ensureQueryData provided via prefetchQuery before the #851 migration.
		// Errors are logged as warnings (they do not block the initial render)
		// and the route's errorComponent only owns the awaited initial fetch's
		// failures.
		void context.queryClient
			.prefetchQuery({
				queryKey: staffTenantDetailsQueryOptions.queryKey({
					tenantId: params.tenantId,
				}),
				queryFn: () =>
					staffTenantDetailsQueryOptions.fetcher({
						tenantId: params.tenantId,
					}),
			})
			.catch((error: unknown) => {
				logger.warn(
					'Profile details loader: background revalidation failed for tenant details fetch',
					{ tenantId: params.tenantId, error },
				);
			});
		void context.queryClient
			.prefetchQuery({
				queryKey: staffTenantProfileDetailsQueryOptions.queryKey({
					tenantId: params.tenantId,
					profileId: params.profileId,
				}),
				queryFn: () =>
					staffTenantProfileDetailsQueryOptions.fetcher({
						tenantId: params.tenantId,
						profileId: params.profileId,
					}),
			})
			.catch((error: unknown) => {
				logger.warn(
					'Profile details loader: background revalidation failed for profile details fetch',
					{
						tenantId: params.tenantId,
						profileId: params.profileId,
						error,
					},
				);
			});
	},
	pendingComponent: ProfileDetailsLoading,
	errorComponent: ProfileRouteErrorBoundary,
	component: StaffTenantProfileDetailsPage,
});
