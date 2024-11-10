import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import { Outlet } from 'react-router-dom';

import { selectSidebar } from '@/office/lib/zustand/features/settings.slice';
import { useMainStore } from '@/office/lib/zustand/store';

import Header from './Header';
import Main from './Main';

// ----------------------------------------------------------------------

type Props = {
	sidebarSlot?: ReactNode;
	children?: ReactNode;
};

const DashboardLayout = ({ sidebarSlot, children }: Props) => {
	const sidebar = useMainStore(selectSidebar);

	const isMini = sidebar === 'mini';

	if (isMini) {
		return (
			<>
				<Header />
				<Box
					sx={{
						minHeight: 1,
						display: 'flex',
						flexDirection: { xs: 'column', lg: 'row' },
					}}
				>
					{/* {lgUp ? renderNavMini : renderNavVertical} */}
					{sidebarSlot}

					<Main>{children ?? <Outlet />}</Main>
				</Box>
			</>
		);
	}

	return (
		<>
			<Header />

			<Box
				sx={{
					minHeight: 1,
					display: 'flex',
					flexDirection: { xs: 'column', lg: 'row' },
				}}
			>
				{/* {renderNavVertical} */}
				{sidebarSlot}

				<Main>{children ?? <Outlet />}</Main>
			</Box>
		</>
	);
};

export default DashboardLayout;
