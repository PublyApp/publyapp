import { Outlet } from 'react-router';

import { MainLayout } from '#app/layouts/main/layout.tsx';

const MarketingLayout = () => {
	return (
		<MainLayout slotProps={{ nav: { data: [] }, footer: { variant: 'home' } }}>
			<Outlet />
		</MainLayout>
	);
};

export default MarketingLayout;
