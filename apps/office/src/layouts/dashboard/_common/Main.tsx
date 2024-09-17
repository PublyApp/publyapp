import Box, { type BoxProps } from '@mui/material/Box';

import { HEADER, NAV } from '@/office/lib/constants';
import { selectSidebar } from '@/office/lib/zustand/features/settings.slice';
import { useMainStore } from '@/office/lib/zustand/store';
import useResponsive from '@/ui-react/hooks/useResponsive';

// components
// import { useSettingsContext } from 'src/components/settings';
// hooks
// import { useResponsive } from 'src/hooks/use-responsive';

//
// import { HEADER, NAV } from '../config-layout';

// ----------------------------------------------------------------------

const SPACING = 8;

const Main = ({ children, sx, ...other }: BoxProps) => {
	const sidebar = useMainStore(selectSidebar);

	const lgUp = useResponsive('up', 'lg');

	const isNavMini = sidebar === 'mini';

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
