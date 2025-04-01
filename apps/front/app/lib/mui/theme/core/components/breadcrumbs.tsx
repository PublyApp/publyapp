import type { Components, Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

const MuiBreadcrumbs: Components<Theme>['MuiBreadcrumbs'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		ol: ({ theme }) => {
			return { rowGap: theme.spacing(0.5), columnGap: theme.spacing(2) };
		},
		li: ({ theme }) => {
			return { display: 'inline-flex', '& > *': { ...theme.typography.body2 } };
		},
		separator: { margin: 0 },
	},
};

// ----------------------------------------------------------------------

export const breadcrumbs = { MuiBreadcrumbs };
