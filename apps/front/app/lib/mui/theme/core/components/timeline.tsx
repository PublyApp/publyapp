import type { Components, Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

const MuiTimelineDot: Components<Theme>['MuiTimelineDot'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: { root: { boxShadow: 'none' } },
};

const MuiTimelineConnector: Components<Theme>['MuiTimelineConnector'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: { root: ({ theme }) => ({ backgroundColor: theme.vars.palette.divider }) },
};

// ----------------------------------------------------------------------

export const timeline = { MuiTimelineDot, MuiTimelineConnector };
