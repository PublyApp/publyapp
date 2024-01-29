import { listClasses, type Theme } from '@mui/material';

import { paper } from '@/ui-react/utils/css.utils';

// ----------------------------------------------------------------------

export const Popover = (theme: Theme) => {
	return {
		MuiPopover: {
			styleOverrides: {
				paper: {
					...paper({ theme, dropdown: true }),
					[`& .${listClasses.root}`]: {
						paddingTop: 0,
						paddingBottom: 0,
					},
				},
			},
		},
	};
};
