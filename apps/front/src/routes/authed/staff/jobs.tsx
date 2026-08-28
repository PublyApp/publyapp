import {
	createFileRoute,
	Link,
	Outlet,
	useRouterState,
} from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';

const TAB_ROUTE_SUFFIXES = ['dead-letter', 'system-jobs'] as const;
type JobsSection = 'queue' | (typeof TAB_ROUTE_SUFFIXES)[number];

const getActiveSection = (pathname: string): JobsSection => {
	const match = TAB_ROUTE_SUFFIXES.find((suffix) =>
		pathname.endsWith(`/${suffix}`),
	);

	return match ?? 'queue';
};

const StaffJobsPage = () => {
	const { t } = useTranslation(['staff-jobs', 'common']);
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const activeSection = getActiveSection(pathname);

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

			<Tabs value={activeSection}>
				<TabsList variant="line">
					<TabsTrigger value="queue" render={<Link to="/staff/jobs" />}>
						{t('tab-queue')}
					</TabsTrigger>
					<TabsTrigger
						value="dead-letter"
						render={<Link to="/staff/jobs/dead-letter" />}
					>
						{t('tab-dead-letter')}
					</TabsTrigger>
					<TabsTrigger
						value="system-jobs"
						render={<Link to="/staff/jobs/system-jobs" />}
					>
						{t('tab-system-jobs')}
					</TabsTrigger>
				</TabsList>

				<TabsContent value={activeSection} className="mt-5">
					<Outlet />
				</TabsContent>
			</Tabs>
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/jobs')({
	staticData: { crumbs: () => [{ kind: 'label', labelKey: 'nav-staff-jobs' }] },
	component: StaffJobsPage,
});
