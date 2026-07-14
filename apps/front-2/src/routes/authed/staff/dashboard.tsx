import {
	createFileRoute,
	Link,
	Outlet,
	useRouterState,
} from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';

const TAB_ROUTE_SUFFIXES = ['activity', 'reports'] as const;
type DashboardSection = 'overview' | (typeof TAB_ROUTE_SUFFIXES)[number];

const getActiveSection = (pathname: string): DashboardSection => {
	const match = TAB_ROUTE_SUFFIXES.find((suffix) =>
		pathname.endsWith(`/${suffix}`),
	);

	return match ?? 'overview';
};

export const Route = createFileRoute('/_authed-layout/staff/dashboard')({
	component: StaffDashboardPage,
});

function StaffDashboardPage() {
	const { t } = useTranslation('common');
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const activeSection = getActiveSection(pathname);

	return (
		<div className="space-y-5" data-testid="staff-dashboard-page">
			<div className="space-y-1" data-testid="staff-dashboard-heading">
				<h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-foreground">
					{t('dashboard')}
				</h1>
			</div>

			<Tabs value={activeSection}>
				<TabsList variant="line">
					<TabsTrigger value="overview" render={<Link to="/staff/dashboard" />}>
						{t('overview')}
					</TabsTrigger>
					<TabsTrigger
						value="activity"
						render={<Link to="/staff/dashboard/activity" />}
					>
						{t('activity')}
					</TabsTrigger>
					<TabsTrigger
						value="reports"
						render={<Link to="/staff/dashboard/reports" />}
					>
						{t('reports')}
					</TabsTrigger>
				</TabsList>

				<TabsContent value={activeSection} className="mt-5">
					<Outlet />
				</TabsContent>
			</Tabs>
		</div>
	);
}
