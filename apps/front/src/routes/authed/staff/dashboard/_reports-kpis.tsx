import {
	IconFileSearch,
	IconKey,
	IconLogin2,
	IconMask,
} from '@tabler/icons-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type {
	FindAuditLogsResponse,
	GetDashboardSeriesForStaffResponse,
} from '@org/client-ts/models/index';

import {
	previousPeriodLabelKey,
	type DashboardPeriod,
} from './_dashboard-filters';
import { KpiCard } from './_dashboard-ui';

/** The four report figures: the period's audit events (with its delta and
 * sparkline) and the impersonations; the two sign-in cards stay ghosts. */
export const ReportsKpis = ({
	auditEvents,
	seriesQuery,
	previousSeriesQuery,
	seriesPoints,
	impersonationsQuery,
	auditDelta,
	period,
	locale,
}: {
	auditEvents: number | null | undefined;
	seriesQuery: UseQueryResult<GetDashboardSeriesForStaffResponse, Error>;
	/** The previous window's series, read only for the delta. */
	previousSeriesQuery: UseQueryResult<
		GetDashboardSeriesForStaffResponse,
		Error
	>;
	seriesPoints: ReadonlyArray<{ label: string; value: number }>;
	impersonationsQuery: UseQueryResult<FindAuditLogsResponse, Error>;
	auditDelta?: { label: string; direction: 'up' | 'down' };
	period: DashboardPeriod;
	locale: string;
}) => {
	const { t } = useTranslation('common');
	const deltaPeriod = t('dashboard-delta-vs-previous', {
		period: t(previousPeriodLabelKey(period)),
	});

	return (
		<div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
			<KpiCard
				testId="staff-dashboard-kpi-report-events"
				label={t('dashboard-kpi-audit-events')}
				icon={<IconFileSearch />}
				figure={auditEvents}
				locale={locale}
				query={seriesQuery}
				deltaQuery={previousSeriesQuery}
				delta={auditDelta}
				deltaPeriod={deltaPeriod}
				sparkline={seriesPoints.map((point) => point.value)}
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
	);
};
