import { useTranslation } from 'react-i18next';

import { DashboardExportMenu } from './_dashboard-export-menu';
import type { DashboardPeriod } from './_dashboard-filters';
import { PeriodSelect } from './_dashboard-ui';

/** The report's period select and export action. */
export const ReportsFilters = ({
	period,
	startDate,
	onPeriodChange,
	onAuthFailure,
}: {
	period: DashboardPeriod;
	startDate: string;
	onPeriodChange: (next: DashboardPeriod) => void;
	onAuthFailure: () => void;
}) => {
	const { t } = useTranslation('common');

	return (
		<div className="mb-4 flex flex-wrap items-center gap-2">
			<div className="w-full sm:w-52">
				<PeriodSelect
					id="staff-dashboard-report-period"
					value={period}
					onChange={onPeriodChange}
					ariaLabel={t('dashboard-filter-report-period')}
					range
				/>
			</div>
			<div className="ml-auto">
				<DashboardExportMenu
					startDate={startDate}
					onAuthFailure={onAuthFailure}
				/>
			</div>
		</div>
	);
};
