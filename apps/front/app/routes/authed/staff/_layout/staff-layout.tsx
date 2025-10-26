import { Suspense } from 'react';
import { Outlet } from 'react-router';

import { LoadingScreen } from '@/front/components/loading-screen';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardLayout } from '@/front/layouts/dashboard/layout';
import { ICONS, type NavDataType } from '@/front/layouts/nav-config-dashboard';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';

const StaffLayout = () => {
	const { t } = useTranslate();

	const staffNavData: NavDataType = [
		{
			subheader: t('overview'),
			items: [
				{
					title: t('dashboard'),
					path: FRONT_PATH_NAMES.staff.root,
					icon: ICONS.dashboard,
					// deepActiveMatch: true,
					// children: [],
				},
				{
					title: t('organizations'),
					path: FRONT_PATH_NAMES.staff.tenants.root,
					icon: ICONS.banking,
					deepActiveMatch: true,
					// children: [],
				},
				{
					title: t('users'),
					path: FRONT_PATH_NAMES.staff.users.root,
					icon: ICONS.user,
					deepActiveMatch: true,
					// children: [],
				},
				{
					title: t('staff-members'),
					path: FRONT_PATH_NAMES.staff.staffMembers.root,
					icon: ICONS.user,
					deepActiveMatch: true,
					// children: [],
				},
				{
					title: t('background-jobs'),
					// path: FRONT_PATH_NAMES.staff.settings.root,
					path: 'background-jobs',
					icon: ICONS.settings,
				},
				{
					title: t('settings'),
					// path: FRONT_PATH_NAMES.staff.settings.root,
					path: 'settings',
					icon: ICONS.settings,
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
