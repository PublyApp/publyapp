import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { staffUserCrumbsBase } from './_crumbs';

const StaffUserActivityTab = () => {
	const { t } = useTranslation(['staff-users', 'common']);

	return (
		<div
			className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] p-4 shadow-[var(--publy-shadow-ring)]"
			data-testid="staff-user-activity-panel"
		>
			<p className="text-sm text-muted-foreground">
				{t('section-not-built-yet')}
			</p>
		</div>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/staff-users/$userId/activity',
)({
	staticData: {
		i18nNamespaces: ['staff-users'],
		crumbs: (params) => [
			...staffUserCrumbsBase(params),
			{ kind: 'label', labelKey: 'common:activity' },
		],
	},
	component: StaffUserActivityTab,
});
