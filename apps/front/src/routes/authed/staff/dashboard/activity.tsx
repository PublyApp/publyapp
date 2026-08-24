import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

const StaffDashboardActivityTab = () => {
	const { t } = useTranslation('common');

	return (
		<div
			className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] p-4 shadow-[var(--publy-shadow-ring)]"
			data-testid="staff-dashboard-activity-panel"
		>
			<p className="text-sm text-muted-foreground">
				{t('dashboard-section-placeholder')}
			</p>
		</div>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/dashboard/activity',
)({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'nav-dashboard', to: '/staff/dashboard' },
			{ kind: 'label', labelKey: 'nav-dashboard-activity' },
		],
	},
	component: StaffDashboardActivityTab,
});
