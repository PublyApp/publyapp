import {
	IconChartBar,
	IconChartPie,
	IconFileSearch,
	IconKey,
	IconLogin2,
	IconMask,
	IconTrendingUp,
} from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { useStaffAuditLogsQuery } from '~/lib/query/staff-audit-logs';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import {
	GhostAxis,
	GhostBars,
	GhostHBars,
	GhostLine,
	GhostStacked,
} from './_chart-ghost';
import { DashboardExportMenu } from './_dashboard-export-menu';
import {
	parseDashboardPeriod,
	periodLabelKey,
	periodStart,
	type DashboardPeriod,
} from './_dashboard-filters';
import { UNKNOWN_VALUE } from './_dashboard-format';
import {
	ChartCard,
	KpiCard,
	PeriodSelect,
	SampleDataChip,
} from './_dashboard-ui';

const Reports = () => {
	const { t, i18n } = useTranslation('common');
	const locale = i18n.language;
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const period: DashboardPeriod = search.period ?? '30d';
	const startDate = periodStart(period);
	const [shouldLogout, setShouldLogout] = useState(false);

	const auditQuery = useStaffAuditLogsQuery({ size: 1, startDate });
	// `impersonation.started` is emitted by the impersonation service, so this
	// figure is real. The two sign-in actions exist only as constants in the
	// backend and are never written, so they have no query at all (B1).
	const impersonationsQuery = useStaffAuditLogsQuery({
		size: 1,
		startDate,
		actions: ['impersonation.started'],
	});

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	for (const queryError of [auditQuery.error, impersonationsQuery.error]) {
		if (queryError !== null && shouldLogoutForFailure(queryError)) {
			return <LogoutRedirect />;
		}
	}

	return (
		<div className="space-y-5" data-testid="staff-dashboard-reports-panel">
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<div className="w-full sm:w-52">
					<PeriodSelect
						id="staff-dashboard-report-period"
						value={period}
						onChange={(next) =>
							void navigate({ search: { period: next }, replace: true })
						}
						ariaLabel={t('dashboard-filter-report-period')}
					/>
				</div>
				<SampleDataChip />
				<div className="ml-auto">
					<DashboardExportMenu
						startDate={startDate}
						onAuthFailure={() => setShouldLogout(true)}
					/>
				</div>
			</div>

			<div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<KpiCard
					testId="staff-dashboard-kpi-report-events"
					label={t('dashboard-kpi-audit-events')}
					icon={<IconFileSearch />}
					figure={auditQuery.data?.totalCount}
					locale={locale}
					query={auditQuery}
				/>
				<KpiCard
					testId="staff-dashboard-kpi-signins"
					label={t('dashboard-kpi-signins')}
					icon={<IconLogin2 />}
					figure={undefined}
					locale={locale}
				/>
				<KpiCard
					testId="staff-dashboard-kpi-failed-signins"
					label={t('dashboard-kpi-failed-signins')}
					icon={<IconKey />}
					figure={undefined}
					locale={locale}
				/>
				<KpiCard
					testId="staff-dashboard-kpi-impersonations"
					label={t('dashboard-kpi-impersonations')}
					icon={<IconMask />}
					figure={impersonationsQuery.data?.totalCount}
					locale={locale}
					query={impersonationsQuery}
				/>
			</div>

			<div className="grid gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
				<ChartCard
					testId="staff-dashboard-events-per-day"
					label={t('dashboard-card-audit-events-per-day')}
					icon={<IconChartBar />}
					note={t('dashboard-note-events-per-day')}
					hero={UNKNOWN_VALUE}
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

				<ChartCard
					testId="staff-dashboard-type-share"
					label={t('dashboard-card-type-share')}
					icon={<IconChartPie />}
					toggle={false}
					series={{
						status: 'unavailable',
						sentence: t('dashboard-ghost-card-type-share'),
						ghost: <GhostStacked />,
					}}
				/>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<ChartCard
					testId="staff-dashboard-signins-per-day"
					label={t('dashboard-card-signins-per-day')}
					icon={<IconTrendingUp />}
					note={`${t('dashboard-note-signins')} · ${t(periodLabelKey(period))}`}
					hero={UNKNOWN_VALUE}
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

/** The report's URL state: the period is optional, so a bare link stays
 * valid. */
type ReportsSearch = { period?: DashboardPeriod };

export const Route = createFileRoute('/_authed-layout/staff/dashboard/reports')(
	{
		validateSearch: (search: Record<string, unknown>): ReportsSearch => ({
			period: parseDashboardPeriod(search.period),
		}),
		staticData: {
			crumbs: () => [
				{ kind: 'label', labelKey: 'nav-dashboard', to: '/staff/dashboard' },
				{ kind: 'label', labelKey: 'nav-dashboard-reports' },
			],
		},
		component: Reports,
	},
);
