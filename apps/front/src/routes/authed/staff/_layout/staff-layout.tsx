import { Suspense } from 'react';
import { Outlet } from 'react-router';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { LoadingScreen } from '#app/components/loading-screen/index.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { DashboardLayout } from '#app/layouts/dashboard/layout.tsx';
import { ICONS, type NavDataType } from '#app/layouts/nav-config-dashboard.tsx';

const StaffLayout = () => {
	const { t } = useTranslate();

	const staffNavData: NavDataType = [
		{
			items: [
				{
					title: t('dashboard'),
					path: FRONT_PATH_NAMES.staff.root,
					icon: ICONS.dashboard,
					deepActiveMatch: false,
				},
			],
		},
		{
			subheader: t('customers'),
			collapsible: false,
			items: [
				{
					title: t('organizations'),
					path: FRONT_PATH_NAMES.staff.tenants.root,
					icon: ICONS.banking,
					deepActiveMatch: true,
				},
				{
					title: t('users'),
					path: FRONT_PATH_NAMES.staff.tenantUsers.root,
					icon: ICONS.user,
					deepActiveMatch: true,
				},
			],
		},
		{
			subheader: t('platform'),
			collapsible: false,
			items: [
				{
					title: t('users'),
					path: FRONT_PATH_NAMES.staff.staffUsers.root,
					icon: ICONS.user,
					deepActiveMatch: true,
				},
				{
					title: `${t('profiles')}`,
					path: FRONT_PATH_NAMES.staff.profiles.root,
					icon: ICONS.lock,
					deepActiveMatch: true,
				},
				{
					title: t('invitations'),
					path: FRONT_PATH_NAMES.staff.invitations.root,
					icon: ICONS.mail,
					deepActiveMatch: true,
				},
				{
					title: t('audit-logs'),
					path: FRONT_PATH_NAMES.staff.auditLogs.root,
					icon: ICONS.history,
					deepActiveMatch: true,
				},
				{
					title: t('workers'),
					path: FRONT_PATH_NAMES.staff.backgroundJobs.root,
					icon: ICONS.job,
					deepActiveMatch: true,
				},
			],
		},
	];

	return (
		<DashboardLayout slotProps={{ nav: { data: staffNavData } }}>
			<Suspense fallback={<LoadingScreen />}>
				<Outlet />
			</Suspense>
		</DashboardLayout>
	);
};

export default StaffLayout;
