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
import { View403 } from '~/components/error-views/View403';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { LoadingSpinner } from '~/components/ui/loading-spinner';
import {
	toStaffTenantUserDetails,
	useRemoveStaffTenantUserMutation,
	useReactivateStaffTenantUserMutation,
	useSuspendStaffTenantUserMutation,
	useStaffTenantUserDetailsQuery,
} from '~/lib/query/staff-tenant-users';
import {
	invalidateAllStaffTenantScopes,
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

import {
	BackToTenantsLink,
	DetailItem,
	formatDateTime,
	formatTenantUserLevelLabel,
	formatTenantUserStatusLabel,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
	TenantRetryActions,
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

const MissingTenantUserView = ({ error }: { error: unknown }) => {
	const { t } = useTranslation('common');

	return (
		<AppErrorView
			icon={<IconSearchOff aria-hidden="true" className="size-7" />}
			code={t('error-404-code')}
			title={t('tenant-user-not-found-title')}
			description={getFailureDescription(
				error,
				t('tenant-user-not-found-description'),
			)}
			testId="staff-tenant-user-details-not-found"
			actions={<BackToTenantsLink />}
		/>
	);
};

const StaffTenantUserDetailsError = ({
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
		return <MissingTenantUserView error={error} />;
	}

	if (isProblemStatus(error, 403)) {
		return <View403 />;
	}

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('error-500-code')}
			title={t('unable-to-load-tenant-user')}
			description={t('tenant-user-load-error-description')}
			testId="staff-tenant-user-details-error"
			actions={<TenantRetryActions onRetry={onRetry} />}
		/>
	);
};

const TenantUserDetailsLoading = () => {
	const { t } = useTranslation('common');

	return (
		<div
			className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12"
			data-testid="staff-tenant-user-details-loading"
		>
			<div className="flex items-center gap-3 text-sm text-muted-foreground">
				<LoadingSpinner />
				<span>{t('loading-tenant-user')}</span>
			</div>
		</div>
	);
};

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
	const { t, i18n } = useTranslation('common');
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
		membershipAction === 'suspend' ? t('suspend') : t('reactivate');
	const membershipActionDisabled =
		isStatusActionPending || isGloballySuspended || !membershipAction;

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
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}
			return;
		} finally {
			setPendingRemove(false);
		}

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

			<Card className="space-y-4 p-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="space-y-1">
						<p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
							{t('tenant-membership-status')}
						</p>
						<p className="text-sm text-foreground">
							{formatTenantUserStatusLabel(user.status, t)}
						</p>
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
					<p className="rounded-large border border-dashed border-border bg-card p-2 text-xs text-muted-foreground">
						{isGloballySuspended
							? t('membership-lifecycle-disabled-globally-suspended')
							: t('membership-lifecycle-unavailable-status')}
					</p>
				) : null}
			</Card>

			<Card className="space-y-4 p-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="space-y-1">
						<p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
							{t('tenant-user-removal')}
						</p>
						<p className="text-sm text-foreground">
							{t('remove-user-from-tenant-description')}
						</p>
					</div>
					<Button
						type="button"
						variant="destructive"
						size="sm"
						onClick={() => setPendingRemove(true)}
						disabled={isAnyActionPending}
					>
						{t('remove-from-tenant')}
						{isRemoveActionPending ? '…' : ''}
					</Button>
				</div>
			</Card>

			<ConfirmDialog
				isOpen={pendingRemove}
				title={t('remove-tenant-user-confirm-title')}
				description={t('remove-tenant-user-confirm-description')}
				confirmLabel={t('remove')}
				isPending={removeTenantUserMutation.isPending}
				onConfirm={() => {
					void handleRemoveAction();
				}}
				onOpenChange={setPendingRemove}
			/>

			<Card className="space-y-4 p-5">
				<div className="grid gap-4 md:grid-cols-2">
					<DetailItem label={t('email')} value={user.email} />
					<DetailItem
						label={t('account-level')}
						value={formatTenantUserLevelLabel(user.accountLevel, t)}
					/>
					<DetailItem
						label={t('status')}
						value={formatTenantUserStatusLabel(user.status, t)}
					/>
					<DetailItem label={t('user-id')} value={user.id} />
					{/* W6-GUARDS (tests F7 / users-auth F11): the API's own
					`tenantId` is nullable in the response type, but this route is
					already scoped to a validated tenant via `Route.useParams()` —
					sourcing the display value from the ROUTE removes the fabricated
					'—' placeholder for a required identity field entirely, instead
					of tolerating a null API value. */}
					<DetailItem label={t('tenant-id')} value={tenantId} />
					{/* data-honesty-ignore: avatarUrl is a documented OPTIONAL field — a user with no uploaded avatar has none, this is not fabricated identity data */}
					<DetailItem label={t('avatar-url')} value={user.avatarUrl ?? '—'} />
				</div>
			</Card>

			<Card className="space-y-4 p-5">
				<div className="space-y-1">
					<p className="text-lg font-semibold text-foreground">
						{t('activity')}
					</p>
					<p className="text-sm text-muted-foreground">
						{t('tenant-user-activity-description')}
					</p>
				</div>
				<div className="grid gap-4">
					{user.createdAt ? (
						<DetailItem
							label={t('created')}
							value={formatDateTime(user.createdAt, i18n.language)}
						/>
					) : null}
					{user.updatedAt ? (
						<DetailItem
							label={t('updated')}
							value={formatDateTime(user.updatedAt, i18n.language)}
						/>
					) : null}
					{!user.createdAt && !user.updatedAt ? (
						<div className="rounded-large border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
							{t('tenant-user-no-timestamps')}
						</div>
					) : null}
				</div>
			</Card>
		</TenantDetailsPageShell>
	);
}
