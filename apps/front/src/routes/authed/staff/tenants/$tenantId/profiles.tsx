import { IconAlertCircle, IconPlus } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { FloatingSelectionBar } from '~/components/table/floating-selection-bar';
import { Button } from '~/components/ui/button';
import {
	selectStaffTenantCrumbName,
	staffTenantCrumbQuery,
	toStaffTenantDetails,
} from '~/lib/query/staff-tenants';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import {
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
	TenantRetryActions,
} from './_tenant-details-shell';
import { ProfileBulkActions } from './profiles/_profile-bulk-actions';
import {
	getProfileFormValues,
	profileFormResolver,
	type ProfileFormValues,
} from './profiles/_profile-form-schema';
import {
	ProfileTypeFilter,
	ProfileViewToggle,
} from './profiles/_profile-list-controls';
import { ProfilesListBody } from './profiles/_profiles-list-body';
import { ProfilesPageDialogs } from './profiles/_profiles-page-dialogs';
import {
	parseStaffTenantProfilesSearchParams,
	serializeStaffTenantProfilesSearchParams,
	toStaffTenantProfileTypeFilterString,
	type StaffTenantProfilesSearchParamInput,
	type StaffTenantProfilesSearchParams,
} from './profiles/_profiles-search-params';
import { useStaffTenantProfilesList } from './profiles/_use-profiles-list-state';

export { deriveTenantProfileCardStyle } from './profiles/_profile-card-style';
export { makeTenantProfileColumns } from './profiles/_profile-columns';
export { tenantProfileTypeChipClassName } from './profiles/_profile-type-chip';
export {
	parseStaffTenantProfileEditId,
	parseStaffTenantProfilesSearchParams,
	parseStaffTenantProfilesViewMode,
	parseStaffTenantProfileTypeFilter,
	resolveStaffTenantProfileDrawerFlags,
	serializeStaffTenantProfilesSearchParams,
	toStaffTenantProfileTypeFilterString,
	type StaffTenantProfilesSearchParamInput,
	type StaffTenantProfilesSearchParams,
	type StaffTenantProfilesViewMode,
	type StaffTenantProfileTypeFilter,
} from './profiles/_profiles-search-params';

// Re-exported so route-local specs can type the mocked drawer's `methods`
// prop against the exact shape the page owns (develop #1306 contract).
export type { ProfileFormValues as StaffTenantProfileFormValues };

const StaffTenantProfilesPage = () => {
	const { tenantId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = parseStaffTenantProfilesSearchParams(
		Route.useSearch() as StaffTenantProfilesSearchParamInput,
	);
	const { t } = useTranslation('common');

	// Both URL writers wrap `Route.useNavigate()` in `useCallback` and are
	// invoked exclusively from event handlers downstream — never during
	// render (`react-doctor/navigate-in-render`).
	const applySearch = useCallback(
		(next: StaffTenantProfilesSearchParams): void => {
			void navigate({
				search: serializeStaffTenantProfilesSearchParams(next),
				replace: true,
			});
		},
		[navigate],
	);

	const pushSearch = useCallback(
		(next: StaffTenantProfilesSearchParams): void => {
			void navigate({
				search: serializeStaffTenantProfilesSearchParams(next),
			});
		},
		[navigate],
	);

	const navigateToProfile = useCallback(
		(profileId: string): void => {
			void navigate({
				to: '/staff/tenants/$tenantId/profiles/$profileId',
				params: { tenantId, profileId },
			});
		},
		[navigate, tenantId],
	);

	// The create form lives here, not inside ProfileFormDrawer: the nav guard
	// below reads `createMethods.formState.isDirty` during THIS component's
	// render, so blocking decisions never wait on a child effect to relay
	// dirtiness upward (tenants-r1-F2, develop #1306 contract). The drawer
	// re-seeds values by remounting under a fresh key.
	const profileFormResolverMemo = useMemo(() => profileFormResolver(t), [t]);
	const createMethods = useForm<ProfileFormValues>({
		resolver: profileFormResolverMemo,
		defaultValues: getProfileFormValues(),
	});
	const {
		formState: { isDirty: isCreateFormDirty },
	} = createMethods;

	const list = useStaffTenantProfilesList({
		tenantId,
		search,
		t,
		applySearch,
		pushSearch,
		navigateToProfile,
		isCreateFormDirty,
	});
	const { controller, detailsQuery, profilesQuery, rows, selection } = list;

	if (detailsQuery.isPending) {
		return <TenantDetailsLoading />;
	}

	if (detailsQuery.isError) {
		if (shouldLogoutForFailure(detailsQuery.error)) {
			return <LogoutRedirect />;
		}

		return (
			<TenantDetailsError
				error={detailsQuery.error}
				onRetry={() => void detailsQuery.refetch()}
			/>
		);
	}

	const tenant = toStaffTenantDetails(detailsQuery.data);
	if (!tenant) {
		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code={t('error-500-code')}
				title={t('tenant-details-error-title')}
				description={t('tenant-response-incomplete')}
				testId="staff-tenant-details-error"
				actions={
					<TenantRetryActions onRetry={() => void detailsQuery.refetch()} />
				}
			/>
		);
	}

	if (profilesQuery.isError && shouldLogoutForFailure(profilesQuery.error)) {
		return <LogoutRedirect />;
	}

	if (list.shouldRedirectToLogout) {
		return <LogoutRedirect />;
	}

	const testId = 'staff-tenant-profiles-grid';
	const toolbarEnd = (
		<div className="flex items-center gap-2">
			<ProfileTypeFilter
				value={toStaffTenantProfileTypeFilterString(search.is_default)}
				onChange={list.setTypeFilter}
				testId={testId}
				disabled={selection.isSelectionMode}
			/>
			<ProfileViewToggle
				view={list.view}
				onChange={list.setView}
				testId={testId}
			/>
		</div>
	);

	return (
		<TenantDetailsPageShell
			tenant={tenant}
			activeSection="profiles"
			testId="staff-tenant-profiles-page"
			bodyScroll={list.view === 'table' ? 'contained' : 'page'}
		>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div className="space-y-1">
					<h2 className="publy-type-page-title">
						{t('profiles')}
						{tenant.profilesCount != null ? (
							<span className="ml-2 publy-profile-count-badge align-middle">
								{tenant.profilesCount}
							</span>
						) : null}
					</h2>
					<p className="publy-type-helper">
						{t('tenant-profiles-tab-description')}
					</p>
				</div>
				<Button
					type="button"
					size="sm"
					onClick={() => list.setCreateDrawerOpen(true)}
				>
					<IconPlus aria-hidden="true" className="size-[15px]" />
					{t('new-profile')}
				</Button>
			</div>

			<ProfilesListBody
				testId={testId}
				tenantId={tenantId}
				view={list.view}
				columns={list.columns}
				rows={rows}
				controller={controller}
				selection={selection}
				bodyState={list.bodyState}
				queryState={{
					hasActiveSearch: list.hasActiveSearch,
					isPending: profilesQuery.isPending,
					isError: profilesQuery.isError,
					isFetching: profilesQuery.isFetching,
				}}
				nextCursor={profilesQuery.data?.nextCursor}
				onRetry={() => void profilesQuery.refetch()}
				onEditRequest={list.onEditRequest}
				onDeleteRequest={list.setDeleteTarget}
				onToggleCardSelection={list.toggleCardSelection}
				toolbarEnd={toolbarEnd}
			/>

			<FloatingSelectionBar
				selectedCount={selection.selectedCount}
				visibleCount={rows.length}
				allVisibleSelected={
					rows.length > 0 && rows.every((row) => selection.rowSelection[row.id])
				}
				onClear={selection.clearSelection}
				onSelectAllVisible={() =>
					selection.onSelectionChange(new Set(rows.map((row) => row.id)))
				}
			>
				<ProfileBulkActions
					tenantId={tenantId}
					rows={rows}
					selection={selection}
					onSessionExpired={() => list.setShouldRedirectToLogout(true)}
				/>
			</FloatingSelectionBar>

			<ProfilesPageDialogs
				tenantId={tenantId}
				deleteTarget={list.deleteTarget}
				isDeletePending={list.deleteProfile.isPending}
				onDeleteConfirm={() => {
					void list.handleDelete();
				}}
				onDeleteDialogClose={() => list.setDeleteTarget(null)}
				isCreateDrawerOpen={list.isCreateDrawerOpen}
				onCreateDrawerOpenChange={list.setCreateDrawerOpen}
				createMethods={createMethods}
				onCreateSaved={list.onCreateSaved}
				editDrawerProfile={list.editDrawerProfile}
				isEditDrawerOpen={list.isEditDrawerOpen}
				onEditDrawerClose={list.closeEditDrawer}
				onEditDirtyChange={list.setIsEditFormDirty}
				onSessionExpired={() => list.setShouldRedirectToLogout(true)}
				blockerStatus={list.drawerBlocker.status}
				onBlockerProceed={list.drawerBlocker.proceed}
				onBlockerReset={list.drawerBlocker.reset}
			/>
		</TenantDetailsPageShell>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/profiles',
)({
	staticData: {
		i18nNamespaces: ['staff-tenant-profiles'],
		crumbs: (params) => [
			{ kind: 'label', labelKey: 'nav-tenants', to: '/staff/tenants' },
			{
				kind: 'entity',
				to: `/staff/tenants/${params.tenantId}`,
				query: staffTenantCrumbQuery,
				select: selectStaffTenantCrumbName,
			},
			{ kind: 'label', labelKey: 'common:profiles' },
		],
	},
	validateSearch: (search) =>
		serializeStaffTenantProfilesSearchParams(
			parseStaffTenantProfilesSearchParams(
				search as StaffTenantProfilesSearchParamInput,
			),
		),
	component: StaffTenantProfilesPage,
});
