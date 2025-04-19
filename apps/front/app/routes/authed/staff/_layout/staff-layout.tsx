import { Suspense } from 'react';
import { Outlet } from 'react-router';

import { LoadingScreen } from '@/front/components/loading-screen';
import { DashboardLayout } from '@/front/layouts/dashboard/layout';
import { ICONS, type NavDataType } from '@/front/layouts/nav-config-dashboard';
import { useTranslate } from '@/front/hooks/use-translate';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';

const StaffLayout = () => {
	const { t } = useTranslate();

	const staffNavData: NavDataType = [
		{
			subheader: t('overview'),
			items: [
				{
					title: t('tenants'),
					path: FRONT_PATH_NAMES.staff.tenants.root,
					icon: ICONS.banking,
				},
				{
					title: t('staff-members'),
					path: FRONT_PATH_NAMES.staff.staffMembers.root,
					icon: ICONS.user,
				},
				{
					title: t('settings'),
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
