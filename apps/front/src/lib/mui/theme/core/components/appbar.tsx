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
		root: ({ ownerState, theme }) => {
			const isTransparent = ownerState.color === 'transparent';
			return {
				boxShadow: 'none',
				borderTop: 'none',
				borderLeft: 'none',
				borderRight: 'none',
				borderBottom: isTransparent
					? 'none'
					: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.12)}`,
				backgroundColor: isTransparent
					? 'transparent'
					: theme.vars.palette.background.default,
				backgroundImage: 'none',
				...theme.applyStyles('dark', {
					borderBottom: isTransparent
						? 'none'
						: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.08)}`,
					backgroundColor: isTransparent
						? 'transparent'
						: theme.vars.palette.background.default,
				}),
			};
		},
	},
};

// ----------------------------------------------------------------------

export const appBar = { MuiAppBar };
