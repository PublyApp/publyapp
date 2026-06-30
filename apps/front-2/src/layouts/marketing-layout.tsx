import type { ReactNode } from 'react';

import { AppShell } from '../components/app-shell';

type MarketingLayoutProps = {
	children: ReactNode;
};

export const MarketingLayout = ({ children }: MarketingLayoutProps) => {
	return <AppShell mode="marketing">{children}</AppShell>;
};

export default MarketingLayout;
