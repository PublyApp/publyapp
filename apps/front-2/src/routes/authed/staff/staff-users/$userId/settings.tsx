import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
	'/_authed-layout/staff/staff-users/$userId/settings',
)({
	component: StaffUserSettingsTab,
});

function StaffUserSettingsTab() {
	return (
		<div className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] p-4 shadow-[var(--publy-shadow-ring)]">
			<p className="text-sm text-muted-foreground">
				This tab is intentionally kept minimal in this handoff scope.
			</p>
		</div>
	);
}
