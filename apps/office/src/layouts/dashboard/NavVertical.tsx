import { useEffect } from 'react';

// @mui
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Stack from '@mui/material/Stack';

import Logo from '@office/components/Logo';
import NavSectionVertical from '@office/components/nav-section/nav-vertical/NavSectionVertical';
import Scrollbar from '@office/components/Scrollbar';
import { useNavData } from '@office/hooks/useNavData';
import usePathname from '@office/hooks/usePathName';
import { NAV } from '@office/utils/constants';
import useResponsive from '@ui-react/hooks/useResponsive';

import NavToggleButton from '../_common/NavToggleButton';

// import { NavToggleButton /* , NavUpgrade */ } from '../_common';

//
// import { NAV } from '../config-layout';

// import { useNavData } from './config-navigation';

// ----------------------------------------------------------------------

type Props = {
	openNav: boolean;
	onCloseNav: VoidFunction;
};

const NavVertical = ({ openNav, onCloseNav }: Props) => {
	// const { user } = useMockedUser();

	const pathname = usePathname();

	const lgUp = useResponsive('up', 'lg');

	const navData = useNavData();

	useEffect(() => {
		if (openNav) {
			onCloseNav();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pathname]);

	const renderContent = (
		<Scrollbar
			sx={{
				height: 1,
				'& .simplebar-content': {
					height: 1,
					display: 'flex',
					flexDirection: 'column',
				},
			}}
		>
			<Logo sx={{ mt: 3, ml: 4, mb: 1 }} />

			<NavSectionVertical
				data={navData}
				config={{
					currentRole: /* user?.role || */ 'admin',
				}}
			/>

			<Box sx={{ flexGrow: 1 }} />

			{/* <NavUpgrade /> */}
		</Scrollbar>
	);

	return (
		<Box
			component="nav"
			sx={{
				flexShrink: { lg: 0 },
				width: { lg: NAV.W_VERTICAL },
			}}
		>
			<NavToggleButton />

			{lgUp ? (
				<Stack
					sx={{
						height: 1,
						position: 'fixed',
						width: NAV.W_VERTICAL,
						borderRight: (theme) => {
							return `dashed 1px ${theme.palette.divider}`;
						},
					}}
				>
					{renderContent}
				</Stack>
			) : (
				<Drawer
					open={openNav}
					onClose={onCloseNav}
					PaperProps={{
						sx: {
							width: NAV.W_VERTICAL,
						},
					}}
				>
					{renderContent}
				</Drawer>
			)}
		</Box>
	);
};

export default NavVertical;
