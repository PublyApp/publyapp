import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { useNavigate } from 'react-router';

import useMatchPath from '@/front/hooks/use-match-path';

import type { SettingsNavItem } from './settings-nav';

type SettingsNavMobileProps = {
	items: SettingsNavItem[];
};

export const SettingsNavMobile = ({ items }: SettingsNavMobileProps) => {
	const matchPath = useMatchPath();
	const navigate = useNavigate();

	const activeHref =
		items.find((item) => matchPath(item.href, item.deep ?? false).active)
			?.href ?? items[0]?.href;

	return (
		<Tabs
			value={activeHref}
			onChange={(_, value: string) => navigate(value)}
			variant="scrollable"
			scrollButtons="auto"
			sx={{
				borderBottom: 1,
				borderColor: 'divider',
			}}
		>
			{items.map((item) => (
				<Tab key={item.href} label={item.label} value={item.href} />
			))}
		</Tabs>
	);
};
