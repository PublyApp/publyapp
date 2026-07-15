import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute(
	'/_authed-layout/staff/staff-users/$userId/permissions',
)({
	component: StaffUserPermissionsTab,
});

function StaffUserPermissionsTab() {
	const { t } = useTranslation('common');

	return (
		<div
			className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] p-4 shadow-[var(--publy-shadow-ring)]"
			data-testid="staff-user-permissions-panel"
		>
			<p className="text-sm text-muted-foreground">
				{t('section-not-built-yet')}
			</p>
		</div>
	);
}
