import Box from '@mui/material/Box';
import type { Breakpoint } from '@mui/material/styles';
import { Outlet } from 'react-router';

import { DashboardContent } from '@/front/layouts/dashboard/content';

import { SettingsNav, type SettingsNavItem } from './settings-nav';
import { SettingsNavMobile } from './settings-nav-mobile';

type SidebarSettingsLayoutProps = {
	items: SettingsNavItem[];
	maxWidth?: Breakpoint;
	breadcrumbs?: React.ReactNode;
};

export const SidebarSettingsLayout = ({
	items,
	maxWidth = 'lg',
	breadcrumbs,
}: SidebarSettingsLayoutProps) => (
	<DashboardContent maxWidth={maxWidth} compact>
		{breadcrumbs}

		{/* Mobile Navigation — visible below md */}
		<Box sx={{ display: { xs: 'block', md: 'none' }, mb: 2 }}>
			<SettingsNavMobile items={items} />
		</Box>

		<Box
			sx={{
				display: 'flex',
				gap: 4,
				flexDirection: { xs: 'column', md: 'row' },
			}}
		>
			{/* Left Navigation - Sticky (desktop) */}
			<Box
				sx={{
					display: { xs: 'none', md: 'block' },
					flexShrink: 0,
					width: 200,
					position: 'sticky',
					top: 80,
					alignSelf: 'flex-start',
					maxHeight: 'calc(100vh - 100px)',
					overflowY: 'auto',
				}}
			>
				<SettingsNav items={items} />
			</Box>

			{/* Main Content */}
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Outlet />
			</Box>
		</Box>
	</DashboardContent>
);
