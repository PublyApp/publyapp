import { IconAlertCircle, IconSearchOff } from '@tabler/icons-react';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import { staffTenantRoleDetailsQueryOptions } from '~/lib/query/staff-tenant-roles';
import { staffTenantDetailsQueryOptions } from '~/lib/query/staff-tenants';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import {
	TenantDetailsError,
	TenantDetailsLoading,
} from '../_tenant-details-shell';
import { staffTenantRoleCrumbsBase } from './$roleId/_crumbs';
import type { StaffTenantRoleDetailsContextValue } from './$roleId/_details-context';
import {
	MissingTenantRoleView,
	RoleDetailsLoading,
	TenantRoleDetailsError,
} from './$roleId/_details-error-views';
import {
	classifyRoleDetailsFailure,
	type RoleDetailsErrorSurface,
} from './$roleId/_role-details-error-classifier';
import { RoleDetailsView } from './$roleId/_role-details-view';
import { ROLE_SECTION_ROUTES, type RoleSection } from './$roleId/_sections';
import { useStaffTenantRoleDetails } from './$roleId/_use-role-details-state';
import {
	parseRoleDetailsSearchParams,
	type RoleDetailsSearchParamInput,
	type RoleDetailsSearchParams,
} from './_role-details-search';

const StaffTenantRoleDetailsPage = () => {
	const { tenantId, roleId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { t, i18n } = useTranslation('staff-tenant-roles');

	// Both URL writers wrap `Route.useNavigate()` in `useCallback` and are
	// invoked exclusively from event handlers downstream — never during
	// render (`react-doctor/navigate-in-render`).
	const applyEditFlag = useCallback(
		(section: RoleSection, isOpen: boolean): void => {
			void navigate({
				to: ROLE_SECTION_ROUTES[section],
				params: { tenantId, roleId },
				search: (
					previous: RoleDetailsSearchParams,
				): RoleDetailsSearchParams => ({
					...previous,
					edit: isOpen ? 1 : undefined,
				}),
				replace: true,
			});
		},
		[navigate, tenantId, roleId],
	);

	const navigateToRolesList = useCallback((): void => {
		void navigate({
			to: '/staff/tenants/$tenantId/roles',
			params: { tenantId },
		});
	}, [navigate, tenantId]);

	const details = useStaffTenantRoleDetails({
		tenantId,
		roleId,
		search,
		locale: i18n.language,
		applyEditFlag,
		navigateToRolesList,
	});
	const {
		detailQuery,
		membersQuery,
		permissionCatalogQuery,
		permissionKeys,
		permissionKeysQuery,
		role,
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
		return <RoleDetailsLoading />;
	}

	if (detailQuery.isError) {
		return (
			<TenantRoleDetailsError
				error={detailQuery.error}
				onRetry={() => void detailQuery.refetch()}
			/>
		);
	}

	if (permissionKeysQuery.isError) {
		return (
			<TenantRoleDetailsError
				error={permissionKeysQuery.error}
				onRetry={() => void permissionKeysQuery.refetch()}
			/>
		);
	}

	if (!role) {
		return (
			<AppErrorView
				icon={<IconSearchOff aria-hidden="true" className="size-7" />}
				code={t('common:error-404-code')}
				title={t('common:tenant-role-not-found-title')}
				description={t('common:tenant-role-payload-empty')}
				testId="staff-tenant-role-details-not-found"
			/>
		);
	}

	// react-doctor: memoizing this literal would require hoisting it above the
	// early returns, breaking conditional hook order on this page. The Provider
	// re-renders only with this page, whose consumers read the same queries.
	const detailsContextValue: StaffTenantRoleDetailsContextValue = {
		tenantId,
		roleId,
		role,
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
		isDeletePending: details.deleteRole.isPending,
		onDeleteRequest: () => details.setPendingDelete(true),
		onSessionExpired: () => details.setShouldRedirectToLogout(true),
		onPermissionsDirtyChange: details.setIsPermissionsMatrixDirty,
	};

	return (
		<RoleDetailsView
			tenantId={tenantId}
			roleId={roleId}
			tenant={tenant}
			role={role}
			permissionKeys={permissionKeys}
			activeSection={details.activeSection}
			detailsContextValue={detailsContextValue}
			pendingDelete={details.pendingDelete}
			isDeletePending={details.deleteRole.isPending}
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
 * path uses (`classifyRoleDetailsFailure`) and reuses the route's existing
 * error views verbatim:
 *
 * - 404 (or malformed-id 400) → `MissingTenantRoleView`
 * - 403 → `View403`
 * - any other recognizable API failure (500, network) →
 *   `TenantRoleDetailsError` + `TenantRetryActions`, whose retry
 *   invalidates the router so the loader (and the query cache it warmed)
 *   re-runs
 * - 401 → `LogoutRedirect`, matching the page body's own 401 handling and
 *   the repo-wide "only 401 logs out" invariant
 * - anything UNCLASSIFIABLE (no API-failure shape at all — a programming
 *   error, not a server answer) is RETHROWN so the parent layout boundary
 *   owns it loudly instead of being masked behind a "not found" view.
 */
const RoleRouteErrorBoundary = ({
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

	const surface: RoleDetailsErrorSurface = classifyRoleDetailsFailure(error);

	if (surface === 'unclassified') {
		throw error;
	}

	if (surface === 'not-found') {
		return <MissingTenantRoleView />;
	}

	if (surface === 'forbidden') {
		return <View403 />;
	}

	return (
		<TenantRoleDetailsError
			error={error}
			onRetry={() => {
				reset();
				void router.invalidate();
			}}
		/>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/roles/$roleId',
)({
	staticData: {
		i18nNamespaces: ['staff-tenant-roles'],
		// Always matched alongside an index/permissions/members child (never
		// the deepest match on its own — see `deriveBreadcrumbTrail`), but the
		// contract requires every route to declare its own trail. The overview
		// base is the correct value for this route's own path.
		crumbs: staffTenantRoleCrumbsBase,
	},
	validateSearch: (search) =>
		parseRoleDetailsSearchParams(search as RoleDetailsSearchParamInput),
	loader: async ({ context, params }) => {
		// #851 round 3 (A3 fix): the migration from ensureQueryData to
		// query({staleTime:'static'}) eliminated the background revalidation of
		// cached loader data that ensureQueryData provided via prefetchQuery.
		// To preserve that behavior, we now use query() for the initial fetch
		// (which propagates errors to the error boundary) followed by
		// prefetchQuery() to trigger background revalidation of stale cached
		// data — matching the old ensureQueryData semantics.
		//
		// prefetchQuery() is deprecated in @tanstack/react-query 5.102+; the
		// migration per the deprecation notice is query().catch(noop). We keep
		// the .catch() handler to log background failures as warnings.
		const fetchTenantDetails = () =>
			context.queryClient.query({
				queryKey: staffTenantDetailsQueryOptions.queryKey({
					tenantId: params.tenantId,
				}),
				queryFn: () =>
					staffTenantDetailsQueryOptions.fetcher({
						tenantId: params.tenantId,
					}),
			});
		const fetchRoleDetails = () =>
			context.queryClient.query({
				queryKey: staffTenantRoleDetailsQueryOptions.queryKey({
					tenantId: params.tenantId,
					roleId: params.roleId,
				}),
				queryFn: () =>
					staffTenantRoleDetailsQueryOptions.fetcher({
						tenantId: params.tenantId,
						roleId: params.roleId,
					}),
			});

		// #851 round 3 (A3 fix): the awaited initial fetch settles both keys.
		// Errors propagate to the error boundary; only this fetch is owned by
		// the route's errorComponent.
		await Promise.all([fetchTenantDetails(), fetchRoleDetails()]);

		// #851 round 3 (A3 fix): background revalidation of the cached data the
		// initial query() just settled. With the default `staleTime: 0`, that
		// data is immediately stale, so these fire-and-forget query() calls
		// each issue a background refetch — exactly the behaviour ensureQueryData
		// provided via prefetchQuery before the #851 migration. Errors are
		// logged as warnings (they do not block the initial render).
		void fetchTenantDetails().catch((error: unknown) => {
			logger.warn(
				'Role details loader: background revalidation failed for tenant details fetch',
				{ tenantId: params.tenantId, error },
			);
		});
		void fetchRoleDetails().catch((error: unknown) => {
			logger.warn(
				'Role details loader: background revalidation failed for role details fetch',
				{
					tenantId: params.tenantId,
					roleId: params.roleId,
					error,
				},
			);
		});
	},
	pendingComponent: RoleDetailsLoading,
	errorComponent: RoleRouteErrorBoundary,
	component: StaffTenantRoleDetailsPage,
});
