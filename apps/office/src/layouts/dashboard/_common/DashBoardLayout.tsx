import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import { Outlet } from 'react-router-dom';

import useResponsive from '@devist/ui-react/hooks/useResponsive';

import { selectSidebar } from '@/office/lib/zustand/features/settings.slice';
import { useMainStore } from '@/office/lib/zustand/store';

import Header from './Header';
import Main from './Main';

// import NavMini from './NavMini';
// import NavVertical from './NavVertical';

// ----------------------------------------------------------------------

type Props = {
	renderNavVertical?: ReactNode;
	renderNavMini?: ReactNode;
	children?: ReactNode;
	onOpenNav?: VoidFunction;
};

const DashboardLayout = ({ renderNavVertical, renderNavMini, children, onOpenNav }: Props) => {
	// const nav = useBoolean();

	const sidebar = useMainStore(selectSidebar);
	const lgUp = useResponsive('up', 'lg');

	const isMini = sidebar === 'mini';

	if (isMini) {
		return (
			<>
				<Header onOpenNav={/* nav.setTrue */ onOpenNav} />

				<Box
					sx={{
						minHeight: 1,
						display: 'flex',
						flexDirection: { xs: 'column', lg: 'row' },
					}}
				>
					{lgUp ? renderNavMini : renderNavVertical}

					<Main>{children ?? <Outlet />}</Main>
				</Box>
			</>
		);
	}

	return (
		<>
			<Header onOpenNav={/* nav.setTrue */ onOpenNav} />

			<Box
				sx={{
					minHeight: 1,
					display: 'flex',
					flexDirection: { xs: 'column', lg: 'row' },
				}}
			>
				{renderNavVertical}

				<Main>{children ?? <Outlet />}</Main>
			</Box>
		</>
	);
};

export default DashboardLayout;
