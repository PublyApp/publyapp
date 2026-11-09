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

/** The four report figures: the period's audit events, sign-ins and failed
 * sign-ins — each with its delta and sparkline — plus the impersonations. */
export const ReportsKpis = ({
	auditEvents,
	seriesQuery,
	previousSeriesQuery,
	seriesPoints,
	impersonationsQuery,
	auditDelta,
	signIns,
	signInsQuery,
	previousSignInsQuery,
	signInsPoints,
	signInsDelta,
	failedSignIns,
	failedSignInsQuery,
	previousFailedSignInsQuery,
	failedSignInsPoints,
	failedSignInsDelta,
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
	signIns: number | undefined;
	signInsQuery: UseQueryResult<GetDashboardSeriesForStaffResponse, Error>;
	previousSignInsQuery: UseQueryResult<
		GetDashboardSeriesForStaffResponse,
		Error
	>;
	signInsPoints: ReadonlyArray<{ label: string; value: number }>;
	signInsDelta?: { label: string; direction: 'up' | 'down' };
	failedSignIns: number | undefined;
	failedSignInsQuery: UseQueryResult<GetDashboardSeriesForStaffResponse, Error>;
	previousFailedSignInsQuery: UseQueryResult<
		GetDashboardSeriesForStaffResponse,
		Error
	>;
	failedSignInsPoints: ReadonlyArray<{ label: string; value: number }>;
	failedSignInsDelta?: { label: string; direction: 'up' | 'down' };
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
				figure={signIns}
				locale={locale}
				query={signInsQuery}
				deltaQuery={previousSignInsQuery}
				delta={signInsDelta}
				deltaPeriod={deltaPeriod}
				sparkline={signInsPoints.map((point) => point.value)}
			/>
			<KpiCard
				testId="staff-dashboard-kpi-failed-signins"
				label={t('dashboard-kpi-failed-signins')}
				icon={<IconKey />}
				figure={failedSignIns}
				locale={locale}
				query={failedSignInsQuery}
				deltaQuery={previousFailedSignInsQuery}
				delta={failedSignInsDelta}
				deltaPeriod={deltaPeriod}
				sparkline={failedSignInsPoints.map((point) => point.value)}
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
