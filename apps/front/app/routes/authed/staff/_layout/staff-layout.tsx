import { Outlet } from 'react-router';

import { LoadingScreen } from '@/front/components/loading-screen';
import { DashboardLayout } from '@/front/layouts/dashboard/layout';
import { Suspense } from 'react';
const StaffLayout = () => {
	return (
		<DashboardLayout>
			<Suspense fallback={<LoadingScreen />}>
				<Outlet />
			</Suspense>
		</DashboardLayout>
	);
};

export default StaffLayout;
