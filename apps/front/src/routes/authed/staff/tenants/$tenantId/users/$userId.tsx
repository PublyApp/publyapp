import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay from '~/components/query-display';
import {
	selectStaffTenantUserCrumbName,
	staffTenantUserCrumbQuery,
	toStaffTenantUserDetails,
	useRemoveStaffTenantUserMutation,
	useReactivateStaffTenantUserMutation,
	useSuspendStaffTenantUserMutation,
	useStaffTenantUserDetailsQuery,
} from '~/lib/query/staff-tenant-users';
import {
	invalidateAllStaffTenantScopes,
	selectStaffTenantCrumbName,
	staffTenantCrumbQuery,
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
} from '../_tenant-details-shell';
import {
	performMembershipAction,
	performRemoveAction,
} from './_details-actions';
import { TenantUserActivityCard } from './_details-activity-card';
import {
	MissingTenantUserPayloadView,
	StaffTenantUserDetailsError,
	TenantDetailsIncompleteView,
	TenantUserDetailsLoading,
} from './_details-error-views';
import { TenantUserDetailsHeader } from './_details-header';
import { TenantUserInfoCard } from './_details-info-card';
import { TenantUserRemovalCard } from './_details-removal-card';
import { TenantUserStatusCard } from './_details-status-card';
import { getDetailsActionState } from './_details-status-helpers';

const StaffTenantUserDetailsPage = () => {
	const { tenantId, userId } = Route.useParams();
	const navigate = Route.useNavigate();
	const { t, i18n } = useTranslation('common');
	const queryClient = useQueryClient();
	const [shouldLogout, setShouldLogout] = useState(false);
	const [pendingRemove, setPendingRemove] = useState(false);
	const suspendMutation = useSuspendStaffTenantUserMutation();
	const reactivateMutation = useReactivateStaffTenantUserMutation();
	const removeMutation = useRemoveStaffTenantUserMutation();

	const tenantQuery = useStaffTenantDetailsQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);
	// Hoisted locals keep raw query flags out of the chained-query gate.
	const tenantQueryIsPending = tenantQuery.isPending;
	const tenantQueryIsError = tenantQuery.isError;
	const detailsQuery = useStaffTenantUserDetailsQuery(
		{ tenantId, userId },
		{
			// Hoisted locals keep raw query flags out of the chained-query gate.
			enabled:
				tenantId.length > 0 &&
				userId.length > 0 &&
				!tenantQueryIsPending &&
				!tenantQueryIsError,
		},
	);

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	// Hoisted so the fatal-error gates read plain locals, not query flags —
	// QueryDisplay owns the loading/error/data rendering below.
	const tenantError = tenantQuery.error;
	if (tenantError !== null && shouldLogoutForFailure(tenantError)) {
		return <LogoutRedirect />;
	}

	const detailsError = detailsQuery.error;
	if (detailsError !== null && shouldLogoutForFailure(detailsError)) {
		return <LogoutRedirect />;
	}

	const renderTenantMissingSlot = (
		<TenantDetailsIncompleteView onRetry={() => void tenantQuery.refetch()} />
	);

	return (
		<QueryDisplay
			query={tenantQuery}
			LoadingSlot={<TenantDetailsLoading />}
			ErrorSlot={
				<TenantDetailsError
					error={tenantError}
					onRetry={() => void tenantQuery.refetch()}
				/>
			}
		>
			{() => {
				const tenant = toStaffTenantDetails(tenantQuery.data);
				if (!tenant) {
					return renderTenantMissingSlot;
				}

				return (
					<QueryDisplay
						query={detailsQuery}
						LoadingSlot={<TenantUserDetailsLoading />}
						ErrorSlot={({ error }) => (
							<StaffTenantUserDetailsError
								error={error}
								onRetry={() => void detailsQuery.refetch()}
							/>
						)}
						EmptySlot={<MissingTenantUserPayloadView />}
					>
						{() => {
							const user = toStaffTenantUserDetails(detailsQuery.data);
							if (!user) {
								return <MissingTenantUserPayloadView />;
							}

							const actionState = getDetailsActionState({
								status: user.status,
								suspendIsPending: suspendMutation.isPending,
								reactivateIsPending: reactivateMutation.isPending,
								removeIsPending: removeMutation.isPending,
							});

							const membershipActionLabel =
								actionState.membershipAction === 'suspend'
									? t('suspend')
									: t('reactivate');

							return (
								<TenantDetailsPageShell
									tenant={tenant}
									activeSection="users"
									testId="staff-tenant-user-details-page"
								>
									<TenantUserDetailsHeader
										displayName={user.displayName}
										email={user.email}
										tenantId={tenantId}
										userId={userId}
									/>

									<TenantUserStatusCard
										userStatus={user.status}
										canChangeStatus={actionState.canChangeStatus}
										membershipAction={actionState.membershipAction}
										membershipActionLabel={membershipActionLabel}
										membershipActionDisabled={
											actionState.membershipActionDisabled
										}
										isStatusActionPending={actionState.isStatusActionPending}
										isGloballySuspended={actionState.isGloballySuspended}
										onMembershipAction={(action) => {
											void performMembershipAction({
												action,
												tenantId,
												userId,
												suspendAsync: suspendMutation.mutateAsync,
												reactivateAsync: reactivateMutation.mutateAsync,
												invalidateQueries: async () => {
													await invalidateAllStaffTenantScopes(queryClient);
												},
												setShouldLogout,
											});
										}}
									/>

									<TenantUserRemovalCard
										isRemoveDialogOpen={pendingRemove}
										isAnyActionPending={actionState.isAnyActionPending}
										isRemoveActionPending={actionState.isRemoveActionPending}
										onOpenRemoveDialog={() => setPendingRemove(true)}
										onRemoveDialogOpenChange={setPendingRemove}
										onConfirmRemove={() => {
											void performRemoveAction({
												tenantId,
												userId,
												removeAsync: removeMutation.mutateAsync,
												invalidateQueries: async () => {
													await invalidateAllStaffTenantScopes(queryClient);
												},
												setShouldLogout,
												setPendingRemove,
												onRemoved: () => {
													void navigate({
														to: '/staff/tenants/$tenantId/users',
														params: { tenantId },
													});
												},
											});
										}}
									/>

									<TenantUserInfoCard
										userEmail={user.email}
										userAccountLevel={user.accountLevel}
										userStatus={user.status}
										userId={user.id}
										tenantId={tenantId}
										avatarUrl={user.avatarUrl}
									/>

									<TenantUserActivityCard
										createdAt={user.createdAt}
										updatedAt={user.updatedAt}
										language={i18n.language}
									/>
								</TenantDetailsPageShell>
							);
						}}
					</QueryDisplay>
				);
			}}
		</QueryDisplay>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/users/$userId',
)({
	staticData: {
		crumbs: (params) => [
			{
				kind: 'label',
				labelKey: 'nav-tenants',
				to: '/staff/tenants',
			},
			{
				kind: 'entity',
				to: `/staff/tenants/${params.tenantId}`,
				query: staffTenantCrumbQuery,
				select: selectStaffTenantCrumbName,
			},
			{
				kind: 'label',
				labelKey: 'common:users',
				to: `/staff/tenants/${params.tenantId}/users`,
			},
			{
				kind: 'entity',
				query: staffTenantUserCrumbQuery,
				select: selectStaffTenantUserCrumbName,
			},
		],
	},
	component: StaffTenantUserDetailsPage,
});
