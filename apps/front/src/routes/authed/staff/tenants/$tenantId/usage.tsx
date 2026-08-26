import {
	IconAlertCircle,
	IconCalendarEvent,
	IconFolder,
	IconUsers,
} from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay from '~/components/query-display';
import { StatCard } from '~/components/ui/stat-card';
import {
	selectStaffTenantCrumbName,
	staffTenantCrumbQuery,
	toStaffTenantDetails,
	toStaffTenantUsage,
	useStaffTenantDetailsQuery,
	useStaffTenantUsageQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	formatDateTime,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
	TenantRetryActions,
} from './_tenant-details-shell';

// Freshness contract (#168): the numbers are exact at read time, but
// last_activity_at is throttled by design — the "Computed …" line rendered
// next to the cards names when this snapshot was computed so a stale figure
// never poses as fresh.
const StaffTenantUsagePage = () => {
	const { tenantId } = Route.useParams();
	const { t, i18n } = useTranslation('common');

	const detailsQuery = useStaffTenantDetailsQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);
	const usageQuery = useStaffTenantUsageQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);

	// Hoisted so the fatal-error gates read plain locals, not query flags —
	// QueryDisplay owns the loading/error/data rendering below.
	const detailsError = detailsQuery.error;
	if (detailsError !== null && shouldLogoutForFailure(detailsError)) {
		return <LogoutRedirect />;
	}

	const usageError = usageQuery.error;
	if (usageError !== null && shouldLogoutForFailure(usageError)) {
		return <LogoutRedirect />;
	}

	const renderTenantMissingSlot = (
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

	return (
		<QueryDisplay
			query={detailsQuery}
			LoadingSlot={<TenantDetailsLoading />}
			ErrorSlot={
				<TenantDetailsError
					error={detailsError}
					onRetry={() => void detailsQuery.refetch()}
				/>
			}
		>
			{() => {
				const tenant = toStaffTenantDetails(detailsQuery.data);
				if (!tenant) {
					return renderTenantMissingSlot;
				}

				return (
					<TenantDetailsPageShell
						tenant={tenant}
						activeSection="usage"
						testId="staff-tenant-usage-page"
					>
						<QueryDisplay
							query={usageQuery}
							LoadingSlot={<TenantDetailsLoading />}
							ErrorSlot={
								<TenantDetailsError
									error={usageError}
									onRetry={() => void usageQuery.refetch()}
								/>
							}
						>
							{() => {
								const usage = toStaffTenantUsage(usageQuery.data);
								if (!usage) {
									return (
										<AppErrorView
											icon={
												<IconAlertCircle
													aria-hidden="true"
													className="size-7"
												/>
											}
											code={t('error-500-code')}
											title={t('tenant-details-error-title')}
											description={t('tenant-response-incomplete')}
											testId="staff-tenant-details-error"
											actions={
												<TenantRetryActions
													onRetry={() => void usageQuery.refetch()}
												/>
											}
										/>
									);
								}

								return (
									<>
										<p className="text-sm text-muted-foreground">
											{t('usage-as-of', {
												datetime: formatDateTime(
													usage.computedAt,
													i18n.language,
												),
											})}
										</p>
										<div className="publy-stat-row">
											<StatCard
												testId="tenant-stat-usage-members"
												label={t('users')}
												icon={
													<IconUsers
														aria-hidden="true"
														className="size-[14px]"
													/>
												}
												secondary={
													<span>
														{t('usage-users-active-of-total', {
															active: usage.usersActive,
															total: usage.usersTotal,
														})}
													</span>
												}
											>
												{usage.usersTotal}
											</StatCard>

											<StatCard
												testId="tenant-stat-usage-projects"
												label={t('projects')}
												icon={
													<IconFolder
														aria-hidden="true"
														className="size-[14px]"
													/>
												}
												secondary={<span />}
											>
												{usage.projectsCount}
											</StatCard>

											<StatCard
												testId="tenant-stat-usage-scheduled"
												label={t('scheduled-publications')}
												icon={
													<IconCalendarEvent
														aria-hidden="true"
														className="size-[14px]"
													/>
												}
												secondary={<span />}
											>
												{usage.scheduledPublicationsCount}
											</StatCard>

											<StatCard
												testId="tenant-stat-usage-last-activity"
												label={t('usage-last-activity')}
												icon={
													<IconCalendarEvent
														aria-hidden="true"
														className="size-[14px]"
													/>
												}
												secondary={
													<span>
														{usage.lastActivityAt === null
															? t('usage-no-activity-yet')
															: ''}
													</span>
												}
											>
												{formatDateTime(usage.lastActivityAt, i18n.language)}
											</StatCard>
										</div>
									</>
								);
							}}
						</QueryDisplay>
					</TenantDetailsPageShell>
				);
			}}
		</QueryDisplay>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/usage',
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
			{ kind: 'label', labelKey: 'common:usage' },
		],
	},
	component: StaffTenantUsagePage,
});
