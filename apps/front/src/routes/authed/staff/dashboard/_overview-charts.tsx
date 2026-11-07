import { IconActivity, IconCircleCheck } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import type { TenantListCountsResponse } from '@org/client-ts/models/index';

import { GhostAxis, GhostLine } from './_chart-ghost';
import {
	ChartBody,
	ChartNote,
	DonutChart,
	type DonutSegment,
} from './_dashboard-charts';
import { ChartCard, DashboardCard, DashboardCardState } from './_dashboard-ui';

/** « Croissance des organisations » (no daily series endpoint yet → its own
 * ghost) and « Organisations par statut » (the tenants list's status facets). */
export const OverviewCharts = ({
	counts,
	isPending,
	error,
	onRetry,
	locale,
}: {
	counts: TenantListCountsResponse | null | undefined;
	isPending: boolean;
	error: unknown;
	onRetry: () => void;
	locale: string;
}) => {
	const { t } = useTranslation('common');

	const statusSegments: DonutSegment[] = counts
		? [
				{
					label: t('dashboard-status-active'),
					value: counts.active ?? 0,
					color: 'var(--publy-success)',
				},
				{
					label: t('dashboard-status-pending'),
					value: counts.pending ?? 0,
					color: 'var(--publy-warning)',
				},
				{
					label: t('dashboard-status-suspended'),
					value: counts.suspended ?? 0,
					color: 'var(--publy-danger)',
				},
			]
		: [];

	return (
		<div className="grid gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
			<ChartCard
				testId="staff-dashboard-growth"
				label={t('dashboard-card-growth')}
				icon={<IconActivity />}
				note={t('dashboard-note-growth')}
				series={{
					status: 'unavailable',
					sentence: t('dashboard-ghost-card-growth'),
					ghost: (
						<>
							<GhostLine />
							<GhostAxis />
						</>
					),
				}}
			/>

			<DashboardCard
				testId="staff-dashboard-status"
				label={t('dashboard-card-status')}
				icon={<IconCircleCheck />}
			>
				<ChartNote>{t('dashboard-note-status')}</ChartNote>
				<ChartBody>
					<DashboardCardState
						testId="staff-dashboard-status"
						isPending={isPending}
						error={error}
						onRetry={onRetry}
					>
						<DonutChart
							segments={statusSegments}
							total={counts?.total ?? 0}
							totalLabel={t('dashboard-filter-organisations')}
							locale={locale}
						/>
					</DashboardCardState>
				</ChartBody>
			</DashboardCard>
		</div>
	);
};
