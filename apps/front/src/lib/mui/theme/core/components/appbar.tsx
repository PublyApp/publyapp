import type { Components, Theme } from '@mui/material/styles';
import { varAlpha } from 'minimal-shared/utils';

// ----------------------------------------------------------------------

const MuiAppBar: Components<Theme>['MuiAppBar'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: { color: 'transparent' },

	/** **************************************
	 * STYLE
	 * Linear/Vercel style: subtle bottom border, no shadow
	 * Uses same border opacity as sidebar for consistency
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			boxShadow: 'none',
			borderTop: 'none',
			borderLeft: 'none',
			borderRight: 'none',
			borderBottom: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.12)}`,
			backgroundColor: theme.vars.palette.background.default,
			...theme.applyStyles('dark', {
				borderBottom: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.08)}`,
				backgroundColor: theme.vars.palette.background.default,
			}),
		}),
	},
};

// ----------------------------------------------------------------------

export const appBar = { MuiAppBar };
