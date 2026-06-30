import type { ReactNode } from 'react';

import { AppShell } from '../components/app-shell';

type MarketingLayoutProps = {
	children: ReactNode;
	pathname?: string;
};

export const MarketingLayout = ({ children, pathname }: MarketingLayoutProps) => {
	return (
		<AppShell mode="marketing" pathname={pathname}>
			{children}
		</AppShell>
	);
};

export default MarketingLayout;
