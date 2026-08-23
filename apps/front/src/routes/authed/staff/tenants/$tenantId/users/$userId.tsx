import {
	IconAlertCircle,
	IconArrowLeft,
	IconSearchOff,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
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
	BackToTenantsLink,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
	TenantRetryActions,
} from '../_tenant-details-shell';
import {
	TenantUserDetailCards,
	type MembershipLifecycle,
} from './_user-detail-cards';
import {
	StaffTenantUserDetailsError,
	TenantUserDetailsLoading,
} from './_user-details-views';

const TENANT_USER_STATUS_ACTIVE = 'active';
const TENANT_USER_STATUS_GLOBALLY_SUSPENDED = 'globally_suspended';
const TENANT_USER_STATUS_SUSPENDED = 'suspended';

// The API surface is currently explicit for ACTIVE/SUSPENDED transitions on tenant
// memberships. Any other status value is treated as ambiguous to avoid accidental
// lifecycle actions we cannot confidently support.

const getNormalizedTenantUserStatus = (
	value: string | null | undefined,
): string => value?.trim().toLowerCase() ?? '';

const StaffTenantUserDetailsPage = () => {
	const { tenantId, userId } = Route.useParams();
	const navigate = Route.useNavigate();
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [shouldLogout, setShouldLogout] = useState(false);
	const [pendingRemove, setPendingRemove] = useState(false);
	const suspendTenantUserMutation = useSuspendStaffTenantUserMutation();
	const reactivateTenantUserMutation = useReactivateStaffTenantUserMutation();
	const removeTenantUserMutation = useRemoveStaffTenantUserMutation();

	const tenantQuery = useStaffTenantDetailsQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);
	const detailsQuery = useStaffTenantUserDetailsQuery(
		{ tenantId, userId },
		{
			enabled:
				tenantId.length > 0 &&
				userId.length > 0 &&
				!tenantQuery.isPending &&
				!tenantQuery.isError,
		},
	);

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

	if (detailsQuery.isError && shouldLogoutForFailure(detailsQuery.error)) {
		return <LogoutRedirect />;
	}

	if (detailsQuery.isPending) {
		return <TenantUserDetailsLoading />;
	}

	const tenant = toStaffTenantDetails(tenantQuery.data);
	if (!tenant) {
		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code={t('error-500-code')}
				title={t('tenant-details-error-title')}
				description={t('tenant-response-incomplete')}
				testId="staff-tenant-details-empty"
				actions={
					<TenantRetryActions onRetry={() => void tenantQuery.refetch()} />
				}
			/>
		);
	}

	if (detailsQuery.isError) {
		return (
			<StaffTenantUserDetailsError
				error={detailsQuery.error}
				onRetry={() => void detailsQuery.refetch()}
			/>
		);
	}

	const user = toStaffTenantUserDetails(detailsQuery.data);
	if (!user) {
		return (
			<AppErrorView
				icon={<IconSearchOff aria-hidden="true" className="size-7" />}
				code={t('error-404-code')}
				title={t('tenant-user-not-found-title')}
				description={t('tenant-user-payload-empty')}
				testId="staff-tenant-user-details-empty"
				actions={<BackToTenantsLink />}
			/>
		);
	}

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	const normalizedStatus = getNormalizedTenantUserStatus(user.status);
	const canSuspend = normalizedStatus === TENANT_USER_STATUS_ACTIVE;
	const canReactivate = normalizedStatus === TENANT_USER_STATUS_SUSPENDED;
	const isGloballySuspended =
		normalizedStatus === TENANT_USER_STATUS_GLOBALLY_SUSPENDED;
	let membershipLifecycle: MembershipLifecycle;
	if (canSuspend) {
		membershipLifecycle = { kind: 'changeable', intent: 'suspend' };
	} else if (canReactivate) {
		membershipLifecycle = { kind: 'changeable', intent: 'reactivate' };
	} else if (isGloballySuspended) {
		membershipLifecycle = { kind: 'globally-suspended' };
	} else {
		membershipLifecycle = { kind: 'locked' };
	}
	const membershipActionLabel =
		membershipLifecycle.kind === 'changeable' &&
		membershipLifecycle.intent === 'suspend'
			? t('suspend')
			: t('reactivate');
	const statusPending =
		suspendTenantUserMutation.isPending ||
		reactivateTenantUserMutation.isPending;
	const removePending = removeTenantUserMutation.isPending;

	const invalidateTenantUserQueries = async () => {
		await invalidateAllStaffTenantScopes(queryClient);
	};

	const handleMembershipAction = async (action: 'suspend' | 'reactivate') => {
		try {
			if (action === 'suspend') {
				await suspendTenantUserMutation.mutateAsync({ tenantId, userId });
			} else {
				await reactivateTenantUserMutation.mutateAsync({ tenantId, userId });
			}
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}
			return;
		}

		await invalidateTenantUserQueries();
	};

	const handleRemoveAction = async () => {
		try {
			await removeTenantUserMutation.mutateAsync({ tenantId, userId });
		} catch (error) {
			// Reset pending state on every exit path — no try/finally,
			// which the React Compiler cannot lower yet.
			setPendingRemove(false);
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}
			return;
		}
		setPendingRemove(false);

		await invalidateTenantUserQueries();
		void navigate({
			to: '/staff/tenants/$tenantId/users',
			params: {
				tenantId,
			},
		});
	};

	return (
		<TenantDetailsPageShell
			tenant={tenant}
			activeSection="users"
			testId="staff-tenant-user-details-page"
		>
			<div className="space-y-2">
				<Link
					to="/staff/tenants/$tenantId/users"
					params={{ tenantId }}
					className="publy-back-link"
				>
					<IconArrowLeft aria-hidden="true" className="size-3" />
					{t('back-to-users')}
				</Link>
				<Link
					to="/staff/tenants/$tenantId/users/$userId/edit"
					params={{ tenantId, userId }}
					className="inline-flex text-sm font-medium text-foreground underline-offset-4 hover:text-foreground hover:underline"
				>
					{t('edit-tenant-user')}
				</Link>

				<div className="space-y-2">
					<h1 className="text-2xl font-semibold tracking-tight text-foreground">
						{user.displayName}
					</h1>
					<p className="max-w-3xl text-sm text-muted-foreground">
						{user.email || t('no-email-available')}
					</p>
				</div>
			</div>

			<TenantUserDetailCards
				user={user}
				tenantId={tenantId}
				membershipLifecycle={membershipLifecycle}
				membershipActionLabel={membershipActionLabel}
				statusPending={statusPending}
				onMembershipAction={() => {
					if (membershipLifecycle.kind === 'changeable') {
						void handleMembershipAction(membershipLifecycle.intent);
					}
				}}
				onRequestRemove={() => setPendingRemove(true)}
				onConfirmRemove={() => {
					void handleRemoveAction();
				}}
				onRemoveOpenChange={setPendingRemove}
				pendingRemove={pendingRemove}
				removePending={removePending}
			/>
		</TenantDetailsPageShell>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/users/$userId',
)({
	staticData: {
		crumbs: (params) => [
			{ kind: 'label', labelKey: 'nav-tenants', to: '/staff/tenants' },
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
