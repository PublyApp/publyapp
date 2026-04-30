import type { Components, Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

const MuiAppBar: Components<Theme>['MuiAppBar'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: { color: 'transparent' },

	/** **************************************
	 * STYLE
	 * Global AppBars stay borderless; individual layouts opt into borders.
	 *************************************** */
	styleOverrides: {
		root: ({ ownerState, theme }) => {
			const isTransparent = ownerState.color === 'transparent';
			return {
				boxShadow: 'none',
				borderTop: 'none',
				borderLeft: 'none',
				borderRight: 'none',
				backgroundColor: isTransparent
					? 'transparent'
					: theme.vars.palette.background.default,
				backgroundImage: 'none',
				...theme.applyStyles('dark', {
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
