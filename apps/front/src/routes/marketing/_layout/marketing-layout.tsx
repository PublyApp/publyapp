import { Outlet } from 'react-router';

import { MainLayout } from '@/front/layouts/main/layout';

const MarketingLayout = () => {
	return (
		<MainLayout slotProps={{ nav: { data: [] } }}>
			<Outlet />
		</MainLayout>
	);
};

export default MarketingLayout;
