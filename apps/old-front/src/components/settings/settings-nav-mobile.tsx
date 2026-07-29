import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { useNavigate } from 'react-router';

import useMatchPath from '#app/hooks/use-match-path.ts';

import type { SettingsNavItem } from './settings-nav';

type SettingsNavMobileProps = {
	items: SettingsNavItem[];
};

export const SettingsNavMobile = ({ items }: SettingsNavMobileProps) => {
	const matchPath = useMatchPath();
	const navigate = useNavigate();

	const activeHref =
		items.find(
			(item) =>
				!(item.disabled ?? false) &&
				matchPath(item.href, item.deep ?? false).active,
		)?.href ?? items[0]?.href;

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
			{items.map((item) => {
				const isDisabled = item.disabled ?? false;

				return (
					<Tab
						key={item.href}
						disabled={isDisabled}
						icon={item.endIcon}
						iconPosition="end"
						label={item.label}
						value={item.href}
					/>
				);
			})}
		</Tabs>
	);
};
