import { IconActivity, IconCircleCheck } from '@tabler/icons-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type {
	FindTenantsAsStaffResponse,
	GetDashboardSeriesForStaffResponse,
} from '@org/client-ts/models/index';

import { GhostAxis, GhostDonut, GhostLine } from './_chart-ghost';
import {
	ChartTable,
	DonutChart,
	LineChart,
	type DonutSegment,
} from './_dashboard-charts';
import { formatCount, toSeriesPoints } from './_dashboard-format';
import { ChartCard } from './_dashboard-ui';

/** « Croissance des organisations » (the active-organisations series, #2349)
 * and « Organisations par statut » (the UNFILTERED tenants facets: the
 * « Organisations » filter never reaches this card, B3). Each card owns its
 * query, so its loading/error state renders through `QueryDisplay`.
 */
export const OverviewCharts = ({
	countsQuery,
	growthQuery,
	locale,
}: {
	countsQuery: UseQueryResult<FindTenantsAsStaffResponse, Error>;
	growthQuery: UseQueryResult<GetDashboardSeriesForStaffResponse, Error>;
	locale: string;
}) => {
	const { t } = useTranslation('common');
	const counts = countsQuery.data?.counts;
	const growthPoints = toSeriesPoints(growthQuery.data?.points, locale);

	const statusSegments: DonutSegment[] = [
		{
			label: t('dashboard-status-active'),
			value: counts?.active ?? 0,
			color: 'var(--publy-success)',
		},
		{
			label: t('dashboard-status-pending'),
			value: counts?.pending ?? 0,
			color: 'var(--publy-warning)',
		},
		{
			label: t('dashboard-status-suspended'),
			value: counts?.suspended ?? 0,
			color: 'var(--publy-danger)',
		},
	];

	return (
		<div className="grid gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
			<ChartCard
				testId="staff-dashboard-growth"
				label={t('dashboard-card-growth')}
				icon={<IconActivity />}
				note={t('dashboard-note-growth')}
				series={
					growthQuery.data
						? {
								status: 'ready',
								chart: (
									<LineChart
										points={growthPoints}
										locale={locale}
										label={t('dashboard-chart-line')}
									/>
								),
								table: (
									<ChartTable
										head={[
											t('dashboard-col-date'),
											t('dashboard-col-organisations'),
										]}
										rows={growthPoints.map((point) => [
											point.label,
											formatCount(point.value, locale),
										])}
									/>
								),
							}
						: {
								status: 'unavailable',
								sentence: t('dashboard-ghost-card-growth'),
								ghost: (
									<>
										<GhostLine />
										<GhostAxis />
									</>
								),
							}
				}
				query={growthQuery}
			/>

			<ChartCard
				testId="staff-dashboard-status"
				label={t('dashboard-card-status')}
				icon={<IconCircleCheck />}
				note={t('dashboard-note-status')}
				toggle={false}
				series={
					counts
						? {
								status: 'ready',
								chart: (
									<DonutChart
										segments={statusSegments}
										total={counts.total ?? 0}
										totalLabel={t('dashboard-filter-organisations')}
										locale={locale}
									/>
								),
								table: null,
							}
						: {
								status: 'unavailable',
								sentence: t('dashboard-ghost-card-status'),
								ghost: <GhostDonut />,
							}
				}
				query={countsQuery}
			/>
		</div>
	);
};
