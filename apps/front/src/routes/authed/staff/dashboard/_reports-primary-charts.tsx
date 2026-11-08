import { IconChartBar, IconChartPie } from '@tabler/icons-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type {
	FindAuditLogsResponse,
	GetDashboardSeriesForStaffResponse,
} from '@org/client-ts/models/index';

import { GhostAxis, GhostBars, GhostStacked } from './_chart-ghost';
import {
	ChartTable,
	ColumnChart,
	StackedShareBar,
	type DonutSegment,
} from './_dashboard-charts';
import {
	UNKNOWN_VALUE,
	formatCount,
	formatPercentOneDecimal,
} from './_dashboard-format';
import { ChartCard } from './_dashboard-ui';

/** The events-per-day column chart and the type-share breakdown. */
export const ReportsPrimaryCharts = ({
	seriesQuery,
	seriesPoints,
	auditEvents,
	auditDelta,
	auditQuery,
	typeSegments,
	typeTotal,
	locale,
}: {
	seriesQuery: UseQueryResult<GetDashboardSeriesForStaffResponse, Error>;
	seriesPoints: ReadonlyArray<{ label: string; value: number }>;
	auditEvents: number | null | undefined;
	auditDelta?: { label: string; direction: 'up' | 'down' };
	auditQuery: UseQueryResult<FindAuditLogsResponse, Error>;
	typeSegments: DonutSegment[];
	typeTotal: number;
	locale: string;
}) => {
	const { t } = useTranslation('common');

	return (
		/* items-start: a 31-row table must not stretch the row and
		   recenter the neighbour card (fix8). */
		<div className="grid gap-4 md:grid-cols-2 items-start">
			<ChartCard
				testId="staff-dashboard-events-per-day"
				label={t('dashboard-card-audit-events-per-day')}
				icon={<IconChartBar />}
				note={t('dashboard-note-events-per-day')}
				hero={
					<span className="flex flex-wrap items-baseline gap-x-2">
						{/* #2339 fix9 MI-5: an unknown figure is the same muted
						    « — » the KPI above shows, never a hard 0. */}
						{auditEvents === null || auditEvents === undefined ? (
							<span className="text-muted-foreground">{UNKNOWN_VALUE}</span>
						) : (
							formatCount(auditEvents, locale)
						)}
						{auditDelta ? (
							<span
								className="text-[12px] font-medium"
								style={{
									color:
										auditDelta.direction === 'up'
											? 'var(--publy-success)'
											: 'var(--publy-danger)',
								}}
							>
								{auditDelta.label}
							</span>
						) : null}
					</span>
				}
				series={
					seriesQuery.data
						? {
								status: 'ready',
								chart: (
									<ColumnChart
										points={seriesPoints}
										locale={locale}
										label={t('dashboard-chart-column')}
									/>
								),
								table: (
									<ChartTable
										head={[t('dashboard-col-date'), t('dashboard-col-events')]}
										rows={seriesPoints.map((point) => [
											point.label,
											formatCount(point.value, locale),
										])}
									/>
								),
							}
						: {
								status: 'unavailable',
								sentence: t('dashboard-ghost-card-events-per-day'),
								ghost: (
									<>
										<GhostBars />
										<GhostAxis />
									</>
								),
							}
				}
				query={seriesQuery}
			/>

			<ChartCard
				testId="staff-dashboard-type-share"
				label={t('dashboard-card-type-share')}
				icon={<IconChartPie />}
				note={t('dashboard-note-type-share')}
				toggle={false}
				series={
					auditQuery.data
						? {
								status: 'ready',
								chart: (
									<div className="flex flex-col gap-6">
										<StackedShareBar segments={typeSegments} locale={locale} />
										<ChartTable
											head={[
												t('dashboard-col-type'),
												t('dashboard-col-share'),
												t('dashboard-col-events'),
											]}
											rows={typeSegments.map((segment) => [
												segment.label,
												formatPercentOneDecimal(
													typeTotal > 0 ? segment.value / typeTotal : 0,
													locale,
												),
												formatCount(segment.value, locale),
											])}
										/>
									</div>
								),
								table: null,
							}
						: {
								status: 'unavailable',
								sentence: t('dashboard-ghost-card-type-share'),
								ghost: <GhostStacked />,
							}
				}
				query={auditQuery}
			/>
		</div>
	);
};
