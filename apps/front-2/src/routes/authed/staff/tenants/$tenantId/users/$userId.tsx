import { IconAlertCircle, IconSearchOff } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	toStaffTenantUserDetails,
	STAFF_TENANT_USER_DETAILS_QUERY_KEY,
	STAFF_TENANT_USERS_QUERY_KEY,
	useRemoveStaffTenantUserMutation,
	useReactivateStaffTenantUserMutation,
	useSuspendStaffTenantUserMutation,
	useStaffTenantUserDetailsQuery,
} from '~/lib/query/staff-tenant-users';
import {
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import {
	DetailItem,
	formatDateTime,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
} from '../_tenant-details-shell';

const MALFORMED_ID_TRANSLATION_KEY = 'malformed-id';
const TENANT_USER_STATUS_ACTIVE = 'active';
const TENANT_USER_STATUS_GLOBALLY_SUSPENDED = 'globally_suspended';
const TENANT_USER_STATUS_SUSPENDED = 'suspended';

// The API surface is currently explicit for ACTIVE/SUSPENDED transitions on tenant
// memberships. Any other status value is treated as ambiguous to avoid accidental
// lifecycle actions we cannot confidently support.

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

const InvalidTenantUserView = ({ error }: { error: unknown }) => (
	<AppErrorView
		icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
		code="400 — Bad Request"
		title="Invalid tenant user link"
		description={getFailureDescription(
			error,
			'This tenant user link is malformed or incomplete.',
		)}
		testId="staff-tenant-user-details-invalid"
	/>
);

const MissingTenantUserView = ({ error }: { error: unknown }) => (
	<AppErrorView
		icon={<IconSearchOff aria-hidden="true" className="size-7" />}
		code="404 — Not Found"
		title="Tenant user not found"
		description={getFailureDescription(
			error,
			'The requested tenant user does not exist or is no longer available.',
		)}
		testId="staff-tenant-user-details-not-found"
	/>
);

const StaffTenantUserDetailsError = ({ error }: { error: unknown }) => {
	if (isProblemStatus(error, 400, MALFORMED_ID_TRANSLATION_KEY)) {
		return <InvalidTenantUserView error={error} />;
	}

	if (isProblemStatus(error, 403)) {
		return <View403 />;
	}

	if (isProblemStatus(error, 404)) {
		return <MissingTenantUserView error={error} />;
	}

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code="500 — Server Error"
			title="Unable to load this tenant user"
			description="There was a problem loading the tenant user details."
			testId="staff-tenant-user-details-error"
		/>
	);
};

const TenantUserDetailsLoading = () => (
	<div
		className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12"
		data-testid="staff-tenant-user-details-loading"
	>
		<div className="flex items-center gap-3 text-sm text-foreground-500">
			<div className="h-2 w-2 rounded-full bg-primary" />
			<span>Loading tenant user…</span>
		</div>
	</div>
);

const getNormalizedTenantUserStatus = (
	value: string | null | undefined,
): string => value?.trim().toLowerCase() ?? '';

const getMembershipActionLabel = (
	status: string,
): 'suspend' | 'reactivate' | null => {
	if (status === TENANT_USER_STATUS_ACTIVE) {
		return 'suspend';
	}

	if (status === TENANT_USER_STATUS_SUSPENDED) {
		return 'reactivate';
	}

	return null;
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/users/$userId',
)({
	component: StaffTenantUserDetailsPage,
});

function StaffTenantUserDetailsPage() {
	const { tenantId, userId } = Route.useParams();
	const navigate = Route.useNavigate();
	const { i18n } = useTranslation('common');
	const queryClient = useQueryClient();
	const [membershipActionError, setMembershipActionError] = useState('');
	const [removeActionError, setRemoveActionError] = useState('');
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

		return <TenantDetailsError error={tenantQuery.error} />;
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
				icon={<IconSearchOff aria-hidden="true" className="size-7" />}
				code="404 — Not Found"
				title="Tenant not found"
				description="The tenant payload was incomplete."
				testId="staff-tenant-details-empty"
			/>
		);
	}

	if (detailsQuery.isError) {
		return <StaffTenantUserDetailsError error={detailsQuery.error} />;
	}

	const user = toStaffTenantUserDetails(detailsQuery.data);
	if (!user) {
		return (
			<AppErrorView
				icon={<IconSearchOff aria-hidden="true" className="size-7" />}
				code="404 — Not Found"
				title="Tenant user not found"
				description="The tenant user payload was empty."
				testId="staff-tenant-user-details-empty"
			/>
		);
	}

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	const normalizedStatus = getNormalizedTenantUserStatus(user.status);
	const canSuspend = normalizedStatus === TENANT_USER_STATUS_ACTIVE;
	const canReactivate = normalizedStatus === TENANT_USER_STATUS_SUSPENDED;
	const canChangeStatus = canSuspend || canReactivate;
	const isGloballySuspended =
		normalizedStatus === TENANT_USER_STATUS_GLOBALLY_SUSPENDED;
	const isStatusActionPending =
		suspendTenantUserMutation.isPending ||
		reactivateTenantUserMutation.isPending;
	const isRemoveActionPending = removeTenantUserMutation.isPending;
	const isAnyActionPending = isStatusActionPending || isRemoveActionPending;

	const membershipAction = getMembershipActionLabel(normalizedStatus);
	const membershipActionLabel =
		membershipAction === 'suspend' ? 'Suspend' : 'Reactivate';
	const membershipActionDisabled =
		isStatusActionPending || isGloballySuspended || !membershipAction;

	const invalidateTenantUserQueries = async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: ['staff', ...STAFF_TENANT_USERS_QUERY_KEY],
			}),
			queryClient.invalidateQueries({
				queryKey: ['staff', ...STAFF_TENANT_USER_DETAILS_QUERY_KEY],
			}),
		]);
	};

	const handleMembershipAction = async (action: 'suspend' | 'reactivate') => {
		try {
			setMembershipActionError('');

			if (action === 'suspend') {
				await suspendTenantUserMutation.mutateAsync({ tenantId, userId });
			} else {
				await reactivateTenantUserMutation.mutateAsync({ tenantId, userId });
			}

			await invalidateTenantUserQueries();
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}

			setMembershipActionError(
				getFailureMessage(toApiFailure(error), {
					fallback: 'Unable to update tenant user membership status.',
				}),
			);
		}
	};

	const handleRemoveAction = async () => {
		setRemoveActionError('');

		try {
			await removeTenantUserMutation.mutateAsync({ tenantId, userId });
			await invalidateTenantUserQueries();
			void navigate({
				to: '/staff/tenants/$tenantId/users',
				params: {
					tenantId,
				},
			});
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}

			setRemoveActionError(
				getFailureMessage(toApiFailure(error), {
					fallback: 'Unable to remove this tenant user from the tenant.',
				}),
			);
		} finally {
			setPendingRemove(false);
		}
	};

	return (
		<TenantDetailsPageShell
			tenant={tenant}
			activeSection="users"
			summary="Read-only tenant user details from the staff tenant users stack."
			testId="staff-tenant-user-details-page"
		>
			<div className="space-y-2">
				<Link
					to="/staff/tenants/$tenantId/users"
					params={{ tenantId }}
					className="text-sm text-foreground-500 underline-offset-4 hover:text-foreground hover:underline"
				>
					Back to users
				</Link>
				<Link
					to="/staff/tenants/$tenantId/users/$userId/edit"
					params={{ tenantId, userId }}
					className="inline-flex text-sm font-medium text-foreground underline-offset-4 hover:text-foreground hover:underline"
				>
					Edit tenant user
				</Link>

				<div className="space-y-2">
					<h1 className="text-2xl font-semibold tracking-tight text-foreground">
						{user.displayName}
					</h1>
					<p className="max-w-3xl text-sm text-foreground-500">
						{user.email || 'No email address available.'}
					</p>
				</div>
			</div>

			<Card className="space-y-4 p-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="space-y-1">
						<p className="text-xs font-medium uppercase tracking-[0.2em] text-foreground-500">
							Tenant membership status
						</p>
						<p className="text-sm text-foreground">{user.status ?? '—'}</p>
					</div>
					<div className="flex items-center gap-2">
						{canChangeStatus ? (
							<Button
								type="button"
								variant="secondary"
								size="sm"
								onClick={() => {
									if (!membershipAction) {
										return;
									}

									void handleMembershipAction(membershipAction);
								}}
								disabled={membershipActionDisabled}
							>
								{membershipActionLabel}
								{isStatusActionPending ? '…' : ''}
							</Button>
						) : null}
					</div>
				</div>

				{!canChangeStatus ? (
					<p className="rounded-large border border-dashed border-divider bg-content1 p-2 text-xs text-foreground-500">
						{isGloballySuspended
							? 'Membership lifecycle actions are disabled for globally suspended users.'
							: 'Membership lifecycle actions are unavailable for this status.'}
					</p>
				) : null}

				{membershipActionError ? (
					<p className="text-sm text-danger-600">{membershipActionError}</p>
				) : null}
			</Card>

			<Card className="space-y-4 p-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="space-y-1">
						<p className="text-xs font-medium uppercase tracking-[0.2em] text-foreground-500">
							Tenant user removal
						</p>
						<p className="text-sm text-foreground">
							Remove this user from this tenant.
						</p>
					</div>
					<Button
						type="button"
						variant="destructive"
						size="sm"
						onClick={() => setPendingRemove(true)}
						disabled={isAnyActionPending}
					>
						Remove from tenant
						{isRemoveActionPending ? '…' : ''}
					</Button>
				</div>

				{removeActionError ? (
					<p className="text-sm text-danger-600">{removeActionError}</p>
				) : null}
			</Card>

			<ConfirmDialog
				isOpen={pendingRemove}
				title="Remove tenant user"
				description="This will permanently remove this user from the tenant. The user will lose access to this tenant and its projects."
				confirmLabel="Remove"
				isPending={removeTenantUserMutation.isPending}
				onConfirm={() => {
					void handleRemoveAction();
				}}
				onOpenChange={setPendingRemove}
			/>

			<Card className="space-y-4 p-5">
				<div className="grid gap-4 md:grid-cols-2">
					<DetailItem label="Email" value={user.email || '—'} />
					<DetailItem label="Account level" value={user.accountLevel ?? '—'} />
					<DetailItem label="Status" value={user.status ?? '—'} />
					<DetailItem label="User ID" value={user.id} />
					<DetailItem label="Tenant ID" value={user.tenantId ?? '—'} />
					<DetailItem label="Avatar URL" value={user.avatarUrl ?? '—'} />
				</div>
			</Card>

			<Card className="space-y-4 p-5">
				<div className="space-y-1">
					<p className="text-lg font-semibold text-foreground">Activity</p>
					<p className="text-sm text-foreground-500">
						Read-only activity timestamps for this tenant user.
					</p>
				</div>
				<div className="grid gap-4">
					{user.createdAt ? (
						<DetailItem
							label="Created"
							value={formatDateTime(user.createdAt, i18n.language)}
						/>
					) : null}
					{user.updatedAt ? (
						<DetailItem
							label="Updated"
							value={formatDateTime(user.updatedAt, i18n.language)}
						/>
					) : null}
					{!user.createdAt && !user.updatedAt ? (
						<div className="rounded-large border border-dashed border-divider bg-content1 p-4 text-sm text-foreground-500">
							No timestamps are available for this tenant user yet.
						</div>
					) : null}
				</div>
			</Card>
		</TenantDetailsPageShell>
	);
}
