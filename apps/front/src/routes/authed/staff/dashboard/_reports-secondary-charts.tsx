import { IconChartBar, IconTrendingUp } from '@tabler/icons-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StateSurface } from '~/components/ui/state-surface';

import type {
	FindTopOrganisationsForStaffResponse,
	GetDashboardSeriesForStaffResponse,
} from '@org/client-ts/models/index';

import { GhostHBars } from './_chart-ghost';
import { ChartTable, HorizontalBars, LineChart } from './_dashboard-charts';
import { periodLabelKey, type DashboardPeriod } from './_dashboard-filters';
import { UNKNOWN_VALUE, formatCount } from './_dashboard-format';
import { ChartCard, ChartHero } from './_dashboard-ui';

/** The sign-ins curve and the top-organisations ranking. */
export const ReportsSecondaryCharts = ({
	period,
	signInsQuery,
	signIns,
	signInsDelta,
	signInsPoints,
	topOrganisationsQuery,
	locale,
}: {
	period: DashboardPeriod;
	signInsQuery: UseQueryResult<GetDashboardSeriesForStaffResponse, Error>;
	/** The same period total the « Connexions » KPI shows. */
	signIns: number | undefined;
	signInsDelta?: { label: string; direction: 'up' | 'down' };
	signInsPoints: ReadonlyArray<{ label: string; value: number }>;
	topOrganisationsQuery: UseQueryResult<
		FindTopOrganisationsForStaffResponse,
		Error
	>;
	locale: string;
}) => {
	const { t } = useTranslation('common');
	const topOrganisations = topOrganisationsQuery.data?.items ?? [];

	return (
		<div className="grid gap-4 md:grid-cols-2">
			<ChartCard
				testId="staff-dashboard-signins-per-day"
				label={t('dashboard-card-signins-per-day')}
				icon={<IconTrendingUp />}
				note={`${t('dashboard-note-signins')} · ${t(periodLabelKey(period))}`}
				hero={
					<ChartHero total={signIns} delta={signInsDelta} locale={locale} />
				}
				// The card owns a query, so `QueryDisplay` paints the skeleton
				// and the error: a ready series is the only body it can reach.
				series={{
					status: 'ready',
					chart: (
						<LineChart
							points={signInsPoints}
							locale={locale}
							label={t('dashboard-chart-line')}
						/>
					),
					table: (
						<ChartTable
							head={[t('dashboard-col-date'), t('dashboard-kpi-signins')]}
							rows={signInsPoints.map((point) => [
								point.label,
								formatCount(point.value, locale),
							])}
						/>
					),
				}}
				query={signInsQuery}
			/>

			<ChartCard
				testId="staff-dashboard-top-orgs"
				label={t('dashboard-card-top-orgs')}
				icon={<IconChartBar />}
				note={t('dashboard-note-top-orgs')}
				toggle={false}
				series={
					topOrganisations.length > 0
						? {
								status: 'ready',
								chart: (
									<HorizontalBars
										rows={topOrganisations.map((item) => ({
											label: item.name ?? UNKNOWN_VALUE,
											value: item.count ?? 0,
											color: 'var(--publy-chart-1)',
										}))}
										locale={locale}
									/>
								),
								table: null,
							}
						: {
								status: 'unavailable',
								sentence: t('dashboard-ghost-card-top-orgs'),
								ghost: <GhostHBars rows={5} />,
							}
				}
				query={topOrganisationsQuery}
				// A served `items: []` is an empty period, not a missing
				// series: the shared empty state, never the ghost's
				// « Pas encore de données » (#2339 fix9 ME-2).
				isEmpty={(data) => (data.items ?? []).length === 0}
				emptySlot={
					<StateSurface
						title={t('dashboard-empty-top-orgs')}
						testId="staff-dashboard-top-orgs-empty"
					/>
				}
			/>
		</div>
	);
};
