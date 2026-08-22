import {
	IconAlertCircle,
	IconClock,
	IconKey,
	IconMail,
	IconShield,
	IconUsers,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { CopyButton } from '~/components/ui/copy-button';
import {
	DangerZoneCard,
	DangerZoneRow,
	DetailAside,
	DetailGrid,
	DetailMain,
} from '~/components/ui/detail-layout';
import { AvatarStack } from '~/components/ui/initials-avatar';
import { PersonAvatar } from '~/components/ui/person-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { StatCard } from '~/components/ui/stat-card';
import { statusPillTone } from '~/components/ui/status-tone';
import {
	toStaffTenantUserRows,
	useStaffTenantUsersQuery,
} from '~/lib/query/staff-tenant-users';
import {
	invalidateStaffTenants,
	selectStaffTenantCrumbName,
	STAFF_TENANT_DETAILS_QUERY_KEY,
	staffTenantCrumbQuery,
	toStaffTenantDetails,
	useDeleteStaffTenantMutation,
	useReactivateStaffTenantMutation,
	useStaffTenantDetailsQuery,
	useSuspendStaffTenantMutation,
	type StaffTenantDetails,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	formatShortDate,
	formatTenantStatusLabel,
	formatTenantUserLevelLabel,
	formatTenantUserStatusLabel,
	getRelativeTimeParts,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
	TenantRetryActions,
} from './$tenantId/_tenant-details-shell';
import {
	getWebsiteHostname,
	isAbsoluteHttpUrl,
} from './tenant-organization-profile-fields';

const TENANT_STATUS_ACTIVE = 'Active';
const TENANT_STATUS_SUSPENDED = 'Suspended';

type PendingLifecycleAction = 'suspend' | 'reactivate' | 'delete' | null;

type LifecycleCopyArgs = {
	isActive: boolean;
	isSuspended: boolean;
	t: (key: string, options?: Record<string, unknown>) => string;
};

const resolveLifecycleTitle = ({
	isActive,
	isSuspended,
	t,
}: LifecycleCopyArgs): string => {
	if (isActive) {
		return t('suspend-tenant');
	}
	if (isSuspended) {
		return t('reactivate-tenant');
	}
	return t('lifecycle-unavailable-title');
};

const resolveLifecycleDescription = ({
	isActive,
	isSuspended,
	tenantName,
	t,
}: LifecycleCopyArgs & { tenantName: string }): string => {
	if (isActive) {
		return t('suspend-tenant-confirm', { name: tenantName });
	}
	if (isSuspended) {
		return t('reactivate-tenant-confirm', { name: tenantName });
	}
	return t('lifecycle-unavailable-until-tenant-activates');
};

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

	if (query.isPending) {
		return <TenantDetailsLoading />;
	}

	if (query.isError) {
		if (shouldLogoutForFailure(query.error)) {
			return <LogoutRedirect />;
		}

		return (
			<TenantDetailsError
				error={query.error}
				onRetry={() => void query.refetch()}
			/>
		);
	}

	const tenant = toStaffTenantDetails(query.data);
	if (!tenant) {
		return (
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

	const seatsLeft = Math.max(tenant.maxUsers - tenant.usersCount, 0);
	const meterPercent =
		tenant.maxUsers > 0
			? Math.min((tenant.usersCount / tenant.maxUsers) * 100, 100)
			: 0;
	const ownerPeople = toStaffTenantUserRows(ownersQuery.data?.data)
		.slice(0, 5)
		.map((row) => ({
			id: row.id,
			name: row.displayName,
			avatarUrl: row.avatarUrl,
		}));
	const hasExpiringSoonInvitations = tenant.expiringSoonInvitationsCount > 0;
	const lifecycleTitle = resolveLifecycleTitle({ isActive, isSuspended, t });
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
			<div className="publy-stat-row">
				<StatCard
					testId="tenant-stat-members"
					label={t('members')}
					icon={<IconUsers aria-hidden="true" className="size-[14px]" />}
					secondary={
						<>
							<div className="publy-stat-meter">
								<div
									className="publy-stat-meter-fill"
									style={{ width: `${meterPercent}%` }}
								/>
							</div>
							<span>{t('seats-left', { count: seatsLeft })}</span>
						</>
					}
				>
					{tenant.usersCount}
					<span className="publy-stat-card-value-suffix">
						{' '}
						/ {tenant.maxUsers}
					</span>
				</StatCard>

				<StatCard
					testId="tenant-stat-owners"
					label={t('owners')}
					icon={<IconKey aria-hidden="true" className="size-[14px]" />}
					secondary={<AvatarStack people={ownerPeople} />}
				>
					{tenant.ownersCount}
				</StatCard>

				<StatCard
					testId="tenant-stat-invites"
					label={t('pending-invites')}
					icon={<IconMail aria-hidden="true" className="size-[14px]" />}
					secondary={
						hasExpiringSoonInvitations ? (
							<>
								<StatusPill tone="warning">
									<IconClock aria-hidden="true" className="size-3" />
									{tenant.expiringSoonInvitationsCount}
								</StatusPill>
								<span>{t('expire-soon')}</span>
							</>
						) : (
							<span>{t('no-invites-expiring-soon')}</span>
						)
					}
				>
					{tenant.pendingInvitationsCount}
				</StatCard>

				<StatCard
					testId="tenant-stat-profiles"
					label={t('profiles')}
					icon={<IconShield aria-hidden="true" className="size-[14px]" />}
					secondary={
						<Link
							to="/staff/tenants/$tenantId/profiles"
							params={{ tenantId: tenant.id }}
							className="publy-stat-card-link"
						>
							{t('view-profiles')}
						</Link>
					}
				>
					{tenant.profilesCount}
				</StatCard>
			</div>

			<DetailGrid>
				<DetailMain>
					<OrganizationCard tenant={tenant} locale={i18n.language} t={t} />
					<UsersPreviewCard tenant={tenant} t={t} />
				</DetailMain>
				<DetailAside>
					<OwnersCard tenant={tenant} ownersQuery={ownersQuery} t={t} />
					<DangerZoneCard title={t('danger-zone')}>
						<DangerZoneRow
							title={lifecycleTitle}
							description={lifecycleDescription}
							action={
								<Button
									type="button"
									variant="destructive"
									size="sm"
									onClick={() =>
										setPendingAction(isActive ? 'suspend' : 'reactivate')
									}
									disabled={isLifecycleUnavailable}
									title={
										isLifecycleUnavailable
											? t('lifecycle-unavailable-until-tenant-activates')
											: undefined
									}
								>
									{lifecycleConfirmLabel}
								</Button>
							}
						/>
						<DangerZoneRow
							title={t('confirm-delete-tenant-title')}
							description={t('confirm-delete-tenant-message')}
							action={
								<Button
									type="button"
									variant="destructive"
									size="sm"
									onClick={() => setPendingAction('delete')}
									disabled={!canDelete || deleteMutation.isPending}
									title={
										canDelete
											? undefined
											: t('delete-tenant-disabled-until-suspended')
									}
								>
									{t('delete')}
								</Button>
							}
						/>
					</DangerZoneCard>
				</DetailAside>
			</DetailGrid>

			<ConfirmDialog
				isOpen={pendingAction === 'suspend' || pendingAction === 'reactivate'}
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
		},
		component: StaffTenantDetailsPage,
	},
);

const OrgField = ({
	label,
	value,
	mono,
	copyValue,
	copyLabel,
	copyTestId,
}: {
	label: string;
	value: ReactNode;
	mono?: boolean;
	copyValue?: string;
	copyLabel?: string;
	copyTestId?: string;
}) => (
	<div className="space-y-1.5">
		<div className="publy-type-metadata-label">{label}</div>
		<div className="flex items-center gap-1.5">
			<div
				className={
					mono
						? 'publy-type-metadata-value font-mono'
						: 'publy-type-metadata-value'
				}
			>
				{value}
			</div>
			{copyValue ? (
				<CopyButton
					value={copyValue}
					label={copyLabel ?? label}
					testId={copyTestId}
				/>
			) : null}
		</div>
	</div>
);

const formatLastActive = (
	value: Date | null,
	t: (key: string, options?: Record<string, unknown>) => string,
): string => {
	const parts = getRelativeTimeParts(value);
	// data-honesty-ignore: relative-time "never active" fallback, not a fabricated identity
	return parts ? t(parts.key, { count: parts.count }) : '—';
};

const OrganizationCard = ({
	tenant,
	locale,
	t,
}: {
	tenant: StaffTenantDetails;
	locale: string;
	t: (key: string, options?: Record<string, unknown>) => string;
}) => {
	const websiteHostname =
		tenant.websiteUrl && isAbsoluteHttpUrl(tenant.websiteUrl)
			? getWebsiteHostname(tenant.websiteUrl)
			: null;

	return (
		<section className="rounded-[var(--publy-radius-card)] bg-card shadow-[var(--publy-shadow-ring)]">
			<div className="publy-card-header">
				<p className="publy-type-section-title">{t('organization')}</p>
				<Link
					to="/staff/tenants/$tenantId/edit"
					params={{ tenantId: tenant.id }}
					className="text-xs font-medium text-muted-foreground hover:text-foreground"
				>
					{t('edit')}
				</Link>
			</div>
			<div className="grid grid-cols-1 gap-4 px-4 pb-4 pt-3 md:grid-cols-3">
				<OrgField label={t('name')} value={tenant.name} />
				{/* data-honesty-ignore: legal name is a documented OPTIONAL field — a tenant without a registered legal name has none, this is not fabricated identity data */}
				<OrgField label={t('legal-name')} value={tenant.legalName ?? '—'} />
				<OrgField
					label={t('code')}
					// data-honesty-ignore: tenant code is a documented OPTIONAL field — a tenant without an assigned workspace slug has none, this is not fabricated identity data
					value={tenant.code ?? '—'}
					mono
					copyValue={tenant.code ?? undefined}
					copyLabel={t('copy-slug')}
					copyTestId="tenant-code-copy"
				/>
				<OrgField
					label={t('tenant-id')}
					value={tenant.id}
					mono
					copyValue={tenant.id}
					copyLabel={t('copy-tenant-id')}
					copyTestId="tenant-id-copy"
				/>
				<OrgField
					label={t('status')}
					value={
						<StatusPill tone={statusPillTone(tenant.status)}>
							{tenant.status
								? formatTenantStatusLabel(tenant.status, t)
								: t('unknown')}
						</StatusPill>
					}
				/>
				<OrgField
					label={t('created')}
					value={formatShortDate(tenant.createdAt, locale)}
				/>
				<OrgField
					label={t('updated')}
					value={formatShortDate(tenant.updatedAt, locale)}
				/>
				<OrgField
					label={t('last-active')}
					value={formatLastActive(tenant.lastActivityAt, t)}
				/>
				{websiteHostname ? (
					<OrgField
						label={t('website')}
						value={
							<a
								href={tenant.websiteUrl ?? undefined}
								target="_blank"
								rel="noreferrer"
								className="publy-record-link no-underline"
							>
								{websiteHostname}
							</a>
						}
					/>
				) : null}
			</div>
		</section>
	);
};

const UsersPreviewCard = ({
	tenant,
	t,
}: {
	tenant: StaffTenantDetails;
	t: (key: string) => string;
}) => {
	const usersQuery = useStaffTenantUsersQuery({
		tenantId: tenant.id,
		size: 5,
		sortId: 'created_at',
		sortOrder: 'desc',
	});
	const rows = toStaffTenantUserRows(usersQuery.data?.data);

	const renderBody = () => {
		if (usersQuery.isPending) {
			return <p className="px-4 py-4 text-xs text-muted-foreground">…</p>;
		}

		if (usersQuery.isError) {
			return (
				<p className="px-4 py-4 text-xs text-muted-foreground">
					{t('tenant-users-preview-error')}
				</p>
			);
		}

		if (rows.length === 0) {
			return (
				<p className="px-4 py-4 text-xs text-muted-foreground">
					{t('no-tenant-members')}
				</p>
			);
		}

		return (
			<div className="divide-y divide-[color:var(--publy-row-border)]">
				{rows.map((row) => (
					<div key={row.id} className="flex items-center gap-3 px-4 py-2.5">
						<PersonAvatar
							name={row.displayName}
							avatarUrl={row.avatarUrl}
							size="sm"
						/>
						<div className="min-w-0 flex-1">
							<p className="truncate text-[13px] font-medium text-foreground">
								{row.displayName}
							</p>
							<p className="truncate text-xs text-muted-foreground">
								{row.email}
							</p>
						</div>
						<StatusPill tone="neutral">
							{formatTenantUserLevelLabel(row.level, t)}
						</StatusPill>
						<StatusPill tone={statusPillTone(row.status)}>
							{formatTenantUserStatusLabel(row.status, t)}
						</StatusPill>
					</div>
				))}
			</div>
		);
	};

	return (
		<section className="rounded-[var(--publy-radius-card)] bg-card shadow-[var(--publy-shadow-ring)]">
			<div className="publy-card-header">
				<p className="publy-type-section-title">
					{t('users')} · {tenant.usersCount}
				</p>
				<Link
					to="/staff/tenants/$tenantId/users"
					params={{ tenantId: tenant.id }}
					className="text-xs font-medium text-muted-foreground hover:text-foreground"
				>
					{t('view-all')}
				</Link>
			</div>
			<div data-testid="tenant-users-preview-rows">{renderBody()}</div>
		</section>
	);
};

const OWNER_LEVEL_FILTER = 'admin';

const OwnersCard = ({
	tenant,
	ownersQuery,
	t,
}: {
	tenant: StaffTenantDetails;
	ownersQuery: ReturnType<typeof useStaffTenantUsersQuery>;
	t: (key: string) => string;
}) => {
	const rows = toStaffTenantUserRows(ownersQuery.data?.data).slice(0, 5);

	let rowsContent: ReactNode;
	if (ownersQuery.isPending) {
		rowsContent = <p className="px-4 py-4 text-xs text-muted-foreground">…</p>;
	} else if (ownersQuery.isError) {
		rowsContent = (
			<p className="px-4 py-4 text-xs text-muted-foreground">
				{t('tenant-owners-preview-error')}
			</p>
		);
	} else if (rows.length === 0) {
		rowsContent = (
			<p className="px-4 py-4 text-xs text-muted-foreground">
				{t('no-tenant-owners')}
			</p>
		);
	} else {
		rowsContent = (
			<div className="divide-y divide-[color:var(--publy-row-border)]">
				{rows.map((row) => (
					<div
						key={row.id}
						className="flex items-center gap-3 px-[18px] py-[11px]"
					>
						<PersonAvatar name={row.displayName} avatarUrl={row.avatarUrl} />
						<div className="min-w-0 flex-1">
							<p className="truncate text-[13px] font-medium text-foreground">
								{row.displayName}
							</p>
							<p className="truncate text-xs text-muted-foreground">
								{row.email}
							</p>
						</div>
						<span className="publy-detail-chip publy-detail-chip--amber shrink-0">
							{t('owner-chip-label')}
						</span>
					</div>
				))}
			</div>
		);
	}

	return (
		<section className="rounded-[var(--publy-radius-card)] bg-card shadow-[var(--publy-shadow-ring)]">
			<div className="publy-card-header">
				<p className="publy-type-section-title">
					{t('owners')} · {tenant.ownersCount}
				</p>
				<Link
					to="/staff/tenants/$tenantId/users"
					params={{ tenantId: tenant.id }}
					search={{ level: OWNER_LEVEL_FILTER }}
					className="text-xs font-medium text-muted-foreground hover:text-foreground"
				>
					{t('see-all')}
				</Link>
			</div>
			<div data-testid="tenant-owners-rows">{rowsContent}</div>
		</section>
	);
};
