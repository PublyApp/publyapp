// @mui
import Box from '@mui/material/Box';

// import { useBoolean } from 'react-use';

// import useResponsive from '@devist/ui-react/hooks/useResponsive';

import { useBoolean } from '@office/hooks/useBoolean';

// hooks
// import { useBoolean } from 'src/hooks/use-boolean';
// import { useResponsive } from 'src/hooks/use-responsive';
// components
// import { useSettingsContext } from 'src/components/settings';
//
// import NavHorizontal from './nav-horizontal';
// import NavMini from './nav-mini';

import Header from './Header';
import Main from './Main';
import NavVertical from './NavVertical';

// ----------------------------------------------------------------------

type Props = {
	children: React.ReactNode;
};

const DashboardLayoutBO = ({ children }: Props) => {
	// const settings = useSettingsContext();

	// const lgUp = useResponsive('up', 'lg');

	const nav = useBoolean();

	// const isHorizontal = settings.themeLayout === 'horizontal';

	// const isMini = settings.themeLayout === 'mini';

	// const renderNavMini = <NavMini />;

	// const renderHorizontal = <NavHorizontal />;

	const renderNavVertical = <NavVertical openNav={nav.value} onCloseNav={nav.setFalse} />;

	// if (isHorizontal) {
	// 	return (
	// 		<>
	// 			<Header onOpenNav={nav.onTrue} />

	// 			{lgUp ? renderHorizontal : renderNavVertical}

	// 			<Main>{children}</Main>
	// 		</>
	// 	);
	// }

	// if (isMini) {
	// 	return (
	// 		<>
	// 			<Header onOpenNav={nav.onTrue} />

	// 			<Box
	// 				sx={{
	// 					minHeight: 1,
	// 					display: 'flex',
	// 					flexDirection: { xs: 'column', lg: 'row' },
	// 				}}
	// 			>
	// 				{lgUp ? renderNavMini : renderNavVertical}

	// 				<Main>{children}</Main>
	// 			</Box>
	// 		</>
	// 	);
	// }

	return (
		<>
			<Header onOpenNav={nav.setTrue} />

			<Box
				sx={{
					minHeight: 1,
					display: 'flex',
					flexDirection: { xs: 'column', lg: 'row' },
				}}
			>
				{renderNavVertical}

				<Main>{children}</Main>
			</Box>
		</>
	);
};

export default DashboardLayoutBO;
