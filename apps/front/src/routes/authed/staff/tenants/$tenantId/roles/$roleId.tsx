import { IconAlertCircle, IconSearchOff } from '@tabler/icons-react';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import { preloadRouteQueries } from '~/lib/query/route-preload';

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
import { roleDetailsQueries } from './$roleId/_queries';
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

	// The seeded full-access system role has no editable state. A `?edit=1`
	// deep link is canonicalized away at the router boundary — replacing the
	// current entry, so Back does not bounce through it — instead of opening
	// a drawer the API would reject. The hook already keeps it shut until
	// this runs.
	const isSystemRole = role?.isFullAccess === true;
	useEffect(() => {
		if (!isSystemRole || search.edit !== 1) {
			return;
		}
		applyEditFlag(details.activeSection, false);
	}, [applyEditFlag, details.activeSection, isSystemRole, search.edit]);

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
 * The route's last-resort error surface for a **render-time throw**. The
 * loader never awaits and never rejects (it warms the query cache
 * fire-and-forget, and the page body classifies every API failure), so the
 * branches below are not reachable from the loader: this boundary exists only
 * so a programming error is not silently reshaped into a "not found" view by
 * the generic parent surface. It reuses the route's existing error views
 * through the same classifier as the page body (`classifyRoleDetailsFailure`)
 * and rethrows an unclassifiable error to the parent layout boundary.
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
	loader: ({ context, params }) => {
		preloadRouteQueries(
			context.queryClient,
			roleDetailsQueries({
				tenantId: params.tenantId,
				roleId: params.roleId,
				locale: context.locale,
			}),
		);
	},
	pendingComponent: RoleDetailsLoading,
	errorComponent: RoleRouteErrorBoundary,
	component: StaffTenantRoleDetailsPage,
});
