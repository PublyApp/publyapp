import type { Theme } from '@mui/material';

// ----------------------------------------------------------------------

export const Timeline = (theme: Theme) => {
	return {
		MuiTimelineDot: {
			styleOverrides: {
				root: {
					boxShadow: 'none',
				},
			},
		},
		MuiTimelineConnector: {
			styleOverrides: {
				root: {
					backgroundColor: theme.palette.divider,
				},
			},
		},
	};
};
