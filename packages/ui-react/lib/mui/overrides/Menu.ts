import type { Theme } from '@mui/material/styles';

import { menuItem } from '@/ui-react/utils/css.utils';

export const Menu = (theme: Theme) => {
	return {
		MuiMenuItem: {
			styleOverrides: {
				root: {
					...menuItem(theme),
				},
			},
		},
	};
};
