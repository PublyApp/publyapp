import { Outlet } from 'react-router';

import MarketingLayout from '@/front/layouts/marketing/MarketingLayout';

const MarketingPagesLayout = () => {
	return (
		<MarketingLayout>
			<Outlet />
		</MarketingLayout>
	);
};

export default MarketingPagesLayout;
