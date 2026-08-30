import { IconAlertCircle } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay from '~/components/query-display';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	DetailAside,
	DetailGrid,
	DetailMain,
} from '~/components/ui/detail-layout';
import { useStaffTenantUsersQuery } from '~/lib/query/staff-tenant-users';
import {
	invalidateStaffTenants,
	selectStaffTenantCrumbName,
	STAFF_TENANT_DETAILS_QUERY_KEY,
	staffTenantCrumbQuery,
	staffTenantDetailsQueryOptions,
	toStaffTenantDetails,
	useDeleteStaffTenantMutation,
	useReactivateStaffTenantMutation,
	useStaffTenantDetailsQuery,
	useSuspendStaffTenantMutation,
} from '~/lib/query/staff-tenants';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { TenantDangerZone } from './$tenantId/_tenant-danger-zone';
import {
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
	TenantRetryActions,
} from './$tenantId/_tenant-details-shell';
import { TenantDetailsStatRow } from './$tenantId/_tenant-details-stat-row';
import {
	resolveLifecycleDescription,
	resolveLifecycleTitle,
} from './$tenantId/_tenant-lifecycle-copy';
import { OrganizationCard } from './$tenantId/_tenant-org-card';
import { OwnersCard } from './$tenantId/_tenant-owners-card';
import { UsersPreviewCard } from './$tenantId/_tenant-users-preview-card';

const TENANT_STATUS_ACTIVE = 'Active';
const TENANT_STATUS_SUSPENDED = 'Suspended';

const OWNER_LEVEL_FILTER = 'admin';

type PendingLifecycleAction = 'suspend' | 'reactivate' | 'delete' | null;

const StaffTenantDetailsPage = () => {
	const { tenantId } = Route.useParams();
	const navigate = Route.useNavigate();
	const { t, i18n } = useTranslation('common');
	const queryClient = useQueryClient();
	const [pendingAction, setPendingAction] =
		useState<PendingLifecycleAction>(null);
	const [shouldLogout, setShouldLogout] = useState(false);

	const suspendMutation = useSuspendStaffTenantMutation();
	const reactivateMutation = useReactivateStaffTenantMutation();
	const deleteMutation = useDeleteStaffTenantMutation();

	const query = useStaffTenantDetailsQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);
	const ownersQuery = useStaffTenantUsersQuery(
		{
			tenantId,
			level: OWNER_LEVEL_FILTER,
			size: 5,
			sortId: 'created_at',
			sortOrder: 'desc',
		},
		{ enabled: tenantId.length > 0 },
	);

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	// Hoisted so the fatal-error gate reads a plain local, not a query flag —
	// QueryDisplay owns the loading/error/data rendering below.
	const queryError = query.error;
	if (queryError !== null && shouldLogoutForFailure(queryError)) {
		return <LogoutRedirect />;
	}

	const renderTenantMissingSlot = (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('error-500-code')}
			title={t('tenant-details-error-title')}
			description={t('tenant-response-incomplete')}
			testId="staff-tenant-details-error"
			embedded
			actions={<TenantRetryActions onRetry={() => void query.refetch()} />}
		/>
	);

	return (
		<QueryDisplay
			query={query}
			LoadingSlot={<TenantDetailsLoading />}
			ErrorSlot={
				<TenantDetailsError
					error={queryError}
					onRetry={() => void query.refetch()}
				/>
			}
		>
			{() => {
				const tenant = toStaffTenantDetails(query.data);
				if (!tenant) {
					return renderTenantMissingSlot;
				}

				const isActive = tenant.status === TENANT_STATUS_ACTIVE;
				const isSuspended = tenant.status === TENANT_STATUS_SUSPENDED;
				const canSuspend = isActive;
				const canReactivate = isSuspended;
				const canDelete = isSuspended;
				const isLifecycleUnavailable = !canSuspend && !canReactivate;
				const isLifecyclePending =
					suspendMutation.isPending || reactivateMutation.isPending;

				const invalidateTenantQueries = async () => {
					await invalidateStaffTenants(queryClient);
				};

				const handleLifecycleConfirm = async () => {
					if (pendingAction !== 'suspend' && pendingAction !== 'reactivate') {
						return;
					}

					const action = pendingAction;

					try {
						if (action === 'suspend') {
							await suspendMutation.mutateAsync({ tenantId: tenant.id });
						} else {
							await reactivateMutation.mutateAsync({ tenantId: tenant.id });
						}
					} catch (error) {
						setPendingAction(null);
						if (shouldLogoutForFailure(error)) {
							setShouldLogout(true);
						}
						return;
					}

					setPendingAction(null);
					await invalidateTenantQueries();
				};

				const handleDeleteConfirm = async () => {
					try {
						await deleteMutation.mutateAsync({ tenantId: tenant.id });
					} catch (error) {
						setPendingAction(null);
						if (shouldLogoutForFailure(error)) {
							setShouldLogout(true);
							return;
						}
						return;
					}

					setPendingAction(null);
					queryClient.removeQueries({
						queryKey: ['staff', ...STAFF_TENANT_DETAILS_QUERY_KEY],
					});
					void invalidateStaffTenants(queryClient);
					await navigate({ to: '/staff/tenants' });
				};

				const lifecycleTitle = resolveLifecycleTitle({
					isActive,
					isSuspended,
					t,
				});
				const lifecycleDescription = resolveLifecycleDescription({
					isActive,
					isSuspended,
					tenantName: tenant.name,
					t,
				});
				const lifecycleConfirmLabel = isActive ? t('suspend') : t('reactivate');

				return (
					<TenantDetailsPageShell
						tenant={tenant}
						activeSection="basics"
						testId="staff-tenant-details-page"
					>
						<TenantDetailsStatRow
							tenant={tenant}
							ownersQuery={ownersQuery}
							t={t}
						/>

						<DetailGrid>
							<DetailMain>
								<OrganizationCard
									tenant={tenant}
									locale={i18n.language}
									t={t}
								/>
								<UsersPreviewCard tenant={tenant} t={t} />
							</DetailMain>
							<DetailAside>
								<OwnersCard
									tenant={tenant}
									ownersQuery={ownersQuery}
									t={t}
									levelFilter={OWNER_LEVEL_FILTER}
								/>
								<TenantDangerZone
									lifecycleTitle={lifecycleTitle}
									lifecycleDescription={lifecycleDescription}
									lifecycleConfirmLabel={lifecycleConfirmLabel}
									isLifecycleUnavailable={isLifecycleUnavailable}
									canDelete={canDelete}
									isDeletePending={deleteMutation.isPending}
									onLifecycleClick={() =>
										setPendingAction(isActive ? 'suspend' : 'reactivate')
									}
									onDeleteClick={() => setPendingAction('delete')}
									t={t}
								/>
							</DetailAside>
						</DetailGrid>

						<ConfirmDialog
							isOpen={
								pendingAction === 'suspend' || pendingAction === 'reactivate'
							}
							title={lifecycleTitle}
							description={lifecycleDescription}
							confirmLabel={lifecycleConfirmLabel}
							isPending={isLifecyclePending}
							onConfirm={() => void handleLifecycleConfirm()}
							onOpenChange={(isOpen) => {
								if (!isOpen) {
									setPendingAction(null);
								}
							}}
						/>
						<ConfirmDialog
							isOpen={pendingAction === 'delete'}
							title={t('confirm-delete-tenant-title')}
							description={t('confirm-delete-tenant-message')}
							confirmLabel={t('delete')}
							isPending={deleteMutation.isPending}
							onConfirm={() => void handleDeleteConfirm()}
							onOpenChange={(isOpen) => {
								if (!isOpen) {
									setPendingAction(null);
								}
							}}
						/>
					</TenantDetailsPageShell>
				);
			}}
		</QueryDisplay>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/tenants/$tenantId')(
	{
		staticData: {
			crumbs: () => [
				{ kind: 'label', labelKey: 'nav-tenants', to: '/staff/tenants' },
				{
					kind: 'entity',
					query: staffTenantCrumbQuery,
					select: selectStaffTenantCrumbName,
				},
			],
			preload: ({ params }) => [
				{
					options: staffTenantDetailsQueryOptions,
					variables: { tenantId: params.tenantId },
				},
			],
		},
		component: StaffTenantDetailsPage,
	},
);
