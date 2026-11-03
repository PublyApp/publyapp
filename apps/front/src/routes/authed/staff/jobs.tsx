import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

const StaffJobsPage = () => {
	const { t } = useTranslation(['staff-jobs', 'common']);

	// §4.8: the panel already lists the three job sections, so the page carries
	// no duplicate tab row — only the shared title and the active page below it.
	return (
		<div className="space-y-5" data-testid="staff-jobs-page">
			<div className="space-y-1" data-testid="staff-jobs-heading">
				<h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-foreground">
					{t('jobs-page-title')}
				</h1>
				<p className="text-sm text-muted-foreground">
					{t('jobs-page-description')}
				</p>
			</div>

			<Outlet />
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/jobs')({
	staticData: { crumbs: () => [{ kind: 'label', labelKey: 'nav-staff-jobs' }] },
	component: StaffJobsPage,
});
