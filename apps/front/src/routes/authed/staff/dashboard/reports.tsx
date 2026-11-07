import {
	IconChartBar,
	IconFileSearch,
	IconKey,
	IconLogin2,
	IconMask,
	IconChartPie,
	IconTrendingUp,
} from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { historyCategory } from '~/components/history/history-actions';
import type { HistoryCategory } from '~/components/history/history-types';
import { StatCard } from '~/components/ui/stat-card';
import { useStaffAuditLogsQuery } from '~/lib/query/staff-audit-logs';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import {
	GhostAxis,
	GhostBars,
	GhostHBars,
	GhostLine,
	GhostSpark,
} from './_chart-ghost';
import {
	ChartBody,
	ChartNote,
	ShareBar,
	UNKNOWN_VALUE,
	formatCount,
	formatShare,
	type DonutSegment,
} from './_dashboard-charts';
import { DashboardExportMenu } from './_dashboard-export-menu';
import {
	ChartCard,
	DashboardCard,
	DashboardCardState,
	PeriodSelect,
	periodLabelKey,
	periodStart,
	type DashboardPeriod,
} from './_dashboard-ui';

/** Audit action families → the prototype's five report domains. The mapping
 * reuses the shared history categoriser, so a new backend action lands in the
 * right row without a second registry. */
const domainOfCategory = (category: HistoryCategory): string => {
	if (category === 'tenant') {
		return 'organisation';
	}
	if (category === 'auth') {
		return 'auth';
	}
	if (category === 'member' || category === 'staff') {
		return 'user';
	}
	if (category === 'invitation') {
		return 'invitation';
	}
	return 'other';
};

const DOMAINS: ReadonlyArray<{
	key: string;
	labelKey: string;
	color: string;
}> = [
	{
		key: 'organisation',
		labelKey: 'dashboard-type-organisation',
		color: 'var(--publy-chart-1)',
	},
	{
		key: 'auth',
		labelKey: 'dashboard-type-auth',
		color: 'var(--publy-chart-2)',
	},
	{
		key: 'user',
		labelKey: 'dashboard-type-user',
		color: 'var(--publy-chart-3)',
	},
	{
		key: 'invitation',
		labelKey: 'dashboard-type-invitation',
		color: 'var(--publy-chart-4)',
	},
	{
		key: 'other',
		labelKey: 'dashboard-type-other',
		color: 'var(--publy-chart-other)',
	},
];

const Reports = () => {
	const { t, i18n } = useTranslation('common');
	const locale = i18n.language;
	const [period, setPeriod] = useState<DashboardPeriod>('30d');
	const [shouldLogout, setShouldLogout] = useState(false);
	const startDate = periodStart(period);

	const auditQuery = useStaffAuditLogsQuery({ size: 1, startDate });
	const signinsQuery = useStaffAuditLogsQuery({
		size: 1,
		startDate,
		actions: ['auth.login.succeeded'],
	});
	const failedQuery = useStaffAuditLogsQuery({
		size: 1,
		startDate,
		actions: ['auth.login.failed'],
	});
	const impersonationsQuery = useStaffAuditLogsQuery({
		size: 1,
		startDate,
		actions: ['impersonation.started'],
	});

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	for (const queryError of [
		auditQuery.error,
		signinsQuery.error,
		failedQuery.error,
		impersonationsQuery.error,
	]) {
		if (queryError !== null && shouldLogoutForFailure(queryError)) {
			return <LogoutRedirect />;
		}
	}

	const counts = auditQuery.data?.counts;
	const domainTotals = new Map<string, number>();
	for (const domain of DOMAINS) {
		domainTotals.set(domain.key, 0);
	}
	for (const row of counts?.byAction ?? []) {
		const domain = domainOfCategory(historyCategory(row.action ?? ''));
		domainTotals.set(
			domain,
			(domainTotals.get(domain) ?? 0) + (row.count ?? 0),
		);
	}
	const domainSegments: DonutSegment[] = DOMAINS.map((domain) => ({
		label: t(domain.labelKey),
		value: domainTotals.get(domain.key) ?? 0,
		color: domain.color,
	}));
	let domainTotal = 0;
	for (const segment of domainSegments) {
		domainTotal += segment.value;
	}

	const kpiValue = (value: number | null | undefined): ReactNode =>
		value === null || value === undefined ? (
			<span className="text-muted-foreground">{UNKNOWN_VALUE}</span>
		) : (
			formatCount(value, locale)
		);
	const ghostFooter = (
		<>
			<span className="min-w-0 truncate">{t('dashboard-ghost-tag')}</span>
			<GhostSpark />
		</>
	);

	return (
		<div className="space-y-4" data-testid="staff-dashboard-reports-panel">
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<div className="w-full sm:w-52">
					<PeriodSelect
						id="staff-dashboard-report-period"
						value={period}
						onChange={setPeriod}
						ariaLabel={t('dashboard-filter-report-period')}
					/>
				</div>
				<div className="ml-auto">
					<DashboardExportMenu
						startDate={startDate}
						onAuthFailure={() => setShouldLogout(true)}
					/>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<StatCard
					testId="staff-dashboard-kpi-report-events"
					label={t('dashboard-kpi-audit-events')}
					icon={<IconFileSearch />}
					value={kpiValue(auditQuery.data?.totalCount)}
					footer={ghostFooter}
					unavailable
				/>
				<StatCard
					testId="staff-dashboard-kpi-signins"
					label={t('dashboard-kpi-signins')}
					icon={<IconLogin2 />}
					value={kpiValue(signinsQuery.data?.totalCount)}
					footer={ghostFooter}
					unavailable
				/>
				<StatCard
					testId="staff-dashboard-kpi-failed-signins"
					label={t('dashboard-kpi-failed-signins')}
					icon={<IconKey />}
					value={kpiValue(failedQuery.data?.totalCount)}
					footer={ghostFooter}
					unavailable
				/>
				<StatCard
					testId="staff-dashboard-kpi-impersonations"
					label={t('dashboard-kpi-impersonations')}
					icon={<IconMask />}
					value={kpiValue(impersonationsQuery.data?.totalCount)}
					footer={ghostFooter}
					unavailable
				/>
			</div>

			<div className="grid gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
				<ChartCard
					testId="staff-dashboard-events-per-day"
					label={t('dashboard-card-audit-events-per-day')}
					icon={<IconChartBar />}
					note={t('dashboard-note-events-per-day')}
					hero={
						auditQuery.data
							? formatCount(auditQuery.data.totalCount ?? 0, locale)
							: UNKNOWN_VALUE
					}
					series={{
						status: 'unavailable',
						sentence: t('dashboard-ghost-card-events-per-day'),
						ghost: (
							<>
								<GhostBars />
								<GhostAxis />
							</>
						),
					}}
				/>

				<DashboardCard
					testId="staff-dashboard-type-share"
					label={t('dashboard-card-type-share')}
					icon={<IconChartPie />}
				>
					<ChartNote>{t('dashboard-note-type-share-all')}</ChartNote>
					<ChartBody>
						<DashboardCardState
							testId="staff-dashboard-type-share"
							isPending={auditQuery.isPending}
							error={auditQuery.error}
							onRetry={() => void auditQuery.refetch()}
						>
							<div className="flex flex-col gap-3">
								<ShareBar
									segments={domainSegments}
									total={domainTotal}
									locale={locale}
									label={t('dashboard-card-type-share')}
								/>
								<table className="w-full border-collapse text-[13px]">
									<thead>
										<tr>
											<th
												scope="col"
												className="border-b border-(--publy-row-border) pb-1.5 text-left text-[11px] font-medium tracking-[0.04em] text-(--publy-foreground-subtle) uppercase"
											>
												{t('dashboard-col-type')}
											</th>
											<th
												scope="col"
												className="border-b border-(--publy-row-border) pb-1.5 text-right font-mono text-[11px] font-medium tracking-[0.04em] text-(--publy-foreground-subtle) uppercase"
											>
												{t('dashboard-col-share')}
											</th>
											<th
												scope="col"
												className="border-b border-(--publy-row-border) pb-1.5 text-right font-mono text-[11px] font-medium tracking-[0.04em] text-(--publy-foreground-subtle) uppercase"
											>
												{t('dashboard-col-events')}
											</th>
										</tr>
									</thead>
									<tbody>
										{domainSegments.map((segment) => (
											<tr
												key={segment.label}
												className="border-t border-(--publy-row-border)"
											>
												<td className="py-2">
													<span className="flex items-center gap-2 font-medium">
														<span
															className="size-2.5 shrink-0 rounded-[3px]"
															style={{ backgroundColor: segment.color }}
														/>
														{segment.label}
													</span>
												</td>
												<td className="py-2 text-right font-mono text-muted-foreground tabular-nums">
													{formatShare(segment.value, domainTotal, locale)}
												</td>
												<td className="py-2 text-right font-mono text-muted-foreground tabular-nums">
													{formatCount(segment.value, locale)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</DashboardCardState>
					</ChartBody>
				</DashboardCard>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<ChartCard
					testId="staff-dashboard-signins-per-day"
					label={t('dashboard-card-signins-per-day')}
					icon={<IconTrendingUp />}
					note={`${t('dashboard-note-signins')} · ${t(periodLabelKey(period))}`}
					series={{
						status: 'unavailable',
						sentence: t('dashboard-ghost-card-signins-per-day'),
						ghost: (
							<>
								<GhostLine />
								<GhostAxis />
							</>
						),
					}}
				/>

				<ChartCard
					testId="staff-dashboard-top-orgs"
					label={t('dashboard-card-top-orgs')}
					icon={<IconChartBar />}
					note={t('dashboard-note-top-orgs')}
					toggle={false}
					series={{
						status: 'unavailable',
						sentence: t('dashboard-ghost-card-top-orgs'),
						ghost: <GhostHBars rows={5} />,
					}}
				/>
			</div>
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/dashboard/reports')(
	{
		staticData: {
			crumbs: () => [
				{ kind: 'label', labelKey: 'nav-dashboard', to: '/staff/dashboard' },
				{ kind: 'label', labelKey: 'nav-dashboard-reports' },
			],
		},
		component: Reports,
	},
);
