import { createFileRoute, Outlet } from '@tanstack/react-router';

const StaffJobsPage = () => (
	<div className="contents" data-testid="staff-jobs-page">
		<Outlet />
	</div>
);

export const Route = createFileRoute('/_authed-layout/staff/jobs')({
	staticData: { crumbs: () => [{ kind: 'label', labelKey: 'nav-staff-jobs' }] },
	component: StaffJobsPage,
});
