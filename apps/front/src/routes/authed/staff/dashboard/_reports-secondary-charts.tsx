import { IconChartBar, IconTrendingUp } from '@tabler/icons-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StateSurface } from '~/components/ui/state-surface';

import type {
	FindTopOrganisationsForStaffResponse,
	GetDashboardSeriesForStaffResponse,
} from '@org/client-ts/models/index';

import { GhostAxis, GhostHBars, GhostLine } from './_chart-ghost';
import { ChartTable, HorizontalBars, LineChart } from './_dashboard-charts';
import { periodLabelKey, type DashboardPeriod } from './_dashboard-filters';
import { UNKNOWN_VALUE, formatCount } from './_dashboard-format';
import { ChartCard } from './_dashboard-ui';

/** The sign-ins curve and the top-organisations ranking. */
export const ReportsSecondaryCharts = ({
	period,
	signInsQuery,
	signInsPoints,
	topOrganisationsQuery,
	locale,
}: {
	period: DashboardPeriod;
	signInsQuery: UseQueryResult<GetDashboardSeriesForStaffResponse, Error>;
	signInsPoints: ReadonlyArray<{ label: string; value: number }>;
	topOrganisationsQuery: UseQueryResult<
		FindTopOrganisationsForStaffResponse,
		Error
	>;
	locale: string;
}) => {
	const { t } = useTranslation('common');
	const topOrganisations = topOrganisationsQuery.data?.items ?? [];
	let signInsTotal: number | undefined;
	if (signInsQuery.data?.points?.length) {
		signInsTotal = 0;
		for (const point of signInsPoints) {
			signInsTotal += point.value;
		}
	}

	return (
		<div className="grid gap-4 md:grid-cols-2">
			<ChartCard
				testId="staff-dashboard-signins-per-day"
				label={t('dashboard-card-signins-per-day')}
				icon={<IconTrendingUp />}
				note={`${t('dashboard-note-signins')} · ${t(periodLabelKey(period))}`}
				hero={
					signInsTotal === undefined ? (
						<span className="text-muted-foreground">{UNKNOWN_VALUE}</span>
					) : (
						formatCount(signInsTotal, locale)
					)
				}
				series={
					signInsQuery.data
						? {
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
							}
						: {
								status: 'unavailable',
								sentence: t('dashboard-ghost-card-signins-per-day'),
								ghost: (
									<>
										<GhostLine />
										<GhostAxis />
									</>
								),
							}
				}
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
