import { Outlet } from 'react-router';

import { MainLayout } from '#app/layouts/main/layout.tsx';

const MarketingLayout = () => {
	return (
		<MainLayout slotProps={{ nav: { data: [] } }}>
			<Outlet />
		</MainLayout>
	);
};

export default MarketingLayout;
