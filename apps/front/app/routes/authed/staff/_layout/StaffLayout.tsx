import type { ErrorBoundaryProps } from 'react-error-boundary';
import { Outlet } from 'react-router';

import { View500 } from '@/front/components/error/500-view';
import { LoadingScreen } from '@/front/components/loading-screen';
import QuerySuspenseBoundary from '@/front/components/QuerySuspenseBoundary';
import { DashboardLayout } from '@/front/layouts/dashboard/layout';

const ErrorBoundary: ErrorBoundaryProps['FallbackComponent'] = () => {
	return <View500 withLayout={false} />;
};

const StaffLayout = () => {
	return (
		<DashboardLayout>
			<QuerySuspenseBoundary
				suspenseFallback={<LoadingScreen />}
				FallbackComponent={ErrorBoundary}
			>
				<Outlet />
			</QuerySuspenseBoundary>
		</DashboardLayout>
	);
};

export default StaffLayout;
