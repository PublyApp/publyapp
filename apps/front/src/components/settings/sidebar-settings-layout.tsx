import Box from '@mui/material/Box';
import type { Breakpoint } from '@mui/material/styles';
import { Outlet } from 'react-router';

import { DashboardContent } from '#app/layouts/dashboard/content.tsx';

import { SettingsNav, type SettingsNavItem } from './settings-nav';
import { SettingsNavMobile } from './settings-nav-mobile';

type SidebarSettingsLayoutProps = {
	items: SettingsNavItem[];
	maxWidth?: Breakpoint;
	breadcrumbs?: React.ReactNode;
	outletContext?: unknown;
};

export const SidebarSettingsLayout = ({
	items,
	maxWidth = 'lg',
	breadcrumbs,
	outletContext,
}: SidebarSettingsLayoutProps) => (
	<DashboardContent
		maxWidth={maxWidth}
		compact
		sx={{ flexGrow: 1, minHeight: 0 }}
	>
		{breadcrumbs}

		{/* Mobile Navigation — visible below md */}
		<Box
			sx={{
				display: { xs: 'block', md: 'none' },
				mb: 2,
				flexShrink: 0,
			}}
		>
			<SettingsNavMobile items={items} />
		</Box>

		<Box
			sx={{
				display: 'flex',
				flexGrow: 1,
				minHeight: 0,
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
			<Box
				sx={{
					flex: 1,
					minWidth: 0,
					minHeight: 0,
					display: 'flex',
					flexDirection: 'column',
				}}
			>
				<Outlet context={outletContext} />
			</Box>
		</Box>
	</DashboardContent>
);
