import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_authed-layout/staff/dashboard/')({
	component: StaffDashboardOverviewTab,
});

function StaffDashboardOverviewTab() {
	const { t } = useTranslation('common');

	return (
		<div
			className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] p-4 shadow-[var(--publy-shadow-ring)]"
			data-testid="staff-dashboard-overview-panel"
		>
			<p className="text-sm text-muted-foreground">
				{t('dashboard-section-placeholder')}
			</p>
		</div>
	);
}
