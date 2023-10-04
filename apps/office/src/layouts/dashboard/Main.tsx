// @mui
import Box, { type BoxProps } from '@mui/material/Box';

import { HEADER, NAV } from '@office/utils/constants';
import useResponsive from '@ui-react/hooks/useResponsive';

// components
// import { useSettingsContext } from 'src/components/settings';
// hooks
// import { useResponsive } from 'src/hooks/use-responsive';

//
// import { HEADER, NAV } from '../config-layout';

// ----------------------------------------------------------------------

const SPACING = 8;

const Main = ({ children, sx, ...other }: BoxProps) => {
	// const settings = useSettingsContext();

	const lgUp = useResponsive('up', 'lg');

	// const isNavHorizontal = settings.themeLayout === 'horizontal';

	const isNavMini = false; /* settings.themeLayout === 'mini' */

	// if (isNavHorizontal) {
	// 	return (
	// 		<Box
	// 			component="main"
	// 			sx={{
	// 				minHeight: 1,
	// 				display: 'flex',
	// 				flexDirection: 'column',
	// 				pt: `${HEADER.H_MOBILE + 24}px`,
	// 				pb: 10,
	// 				...(lgUp && {
	// 					pt: `${HEADER.H_MOBILE * 2 + 40}px`,
	// 					pb: 15,
	// 				}),
	// 			}}
	// 		>
	// 			{children}
	// 		</Box>
	// 	);
	// }

	return (
		<Box
			component="main"
			sx={{
				flexGrow: 1,
				minHeight: 1,
				display: 'flex',
				flexDirection: 'column',
				py: `${HEADER.H_MOBILE + SPACING}px`,
				...(lgUp && {
					px: 2,
					py: `${HEADER.H_DESKTOP + SPACING}px`,
					width: `calc(100% - ${NAV.W_VERTICAL}px)`,
					...(isNavMini
						? {
								width: `calc(100% - ${NAV.W_MINI}px)`,
						  }
						: {}),
				}),
				...sx,
			}}
			{...other}
		>
			{children}
		</Box>
	);
};

export default Main;
