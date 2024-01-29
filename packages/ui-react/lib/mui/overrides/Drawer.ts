import { alpha, drawerClasses, type DrawerProps, type Theme } from '@mui/material';

import { paper } from '@/ui-react/utils/css.utils';

// import { paper } from '../../css';

// ----------------------------------------------------------------------

export const Drawer = (theme: Theme) => {
	const lightMode = theme.palette.mode === 'light';

	return {
		MuiDrawer: {
			styleOverrides: {
				root: ({ ownerState }: { ownerState: DrawerProps }) => {
					return {
						...(ownerState.variant === 'temporary' && {
							[`& .${drawerClasses.paper}`]: {
								...paper({ theme }),
								...(ownerState.anchor === 'left' && {
									boxShadow: `40px 40px 80px -8px ${alpha(
										lightMode ? theme.palette.grey[500] : theme.palette.common.black,
										0.24,
									)}`,
								}),
								...(ownerState.anchor === 'right' && {
									boxShadow: `-40px 40px 80px -8px ${alpha(
										lightMode ? theme.palette.grey[500] : theme.palette.common.black,
										0.24,
									)}`,
								}),
							},
						}),
					};
				},
			},
		},
	};
};
