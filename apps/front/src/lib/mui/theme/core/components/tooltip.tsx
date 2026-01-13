import type { Theme, Components } from '@mui/material/styles';

import { tooltipClasses } from '@mui/material/Tooltip';

// ----------------------------------------------------------------------

const MuiTooltip: Components<Theme>['MuiTooltip'] = {
	/** **************************************
	 * DEFAULT PROPS
	 * UI Foundations: arrow: true
	 *************************************** */
	defaultProps: {
		arrow: true,
	},
	/** **************************************
	 * STYLE
	 * UI Foundations tooltip styling
	 *************************************** */
	styleOverrides: {
		tooltip: ({ theme }) => ({
			backgroundColor: theme.vars.palette.grey[900],
			color: theme.vars.palette.grey[50],
			fontSize: '0.75rem',
			fontWeight: 500,
			padding: theme.spacing(0.75, 1.25),
			borderRadius: Number(theme.shape.borderRadius) * 0.75,
			...theme.applyStyles('dark', {
				backgroundColor: theme.vars.palette.grey[700],
				color: theme.vars.palette.grey[100],
			}),
		}),
		arrow: ({ theme }) => ({
			color: theme.vars.palette.grey[900],
			...theme.applyStyles('dark', {
				color: theme.vars.palette.grey[700],
			}),
		}),
		popper: {
			[`&.${tooltipClasses.popper}[data-popper-placement*="bottom"] .${tooltipClasses.tooltip}`]:
				{
					marginTop: 8,
				},
			[`&.${tooltipClasses.popper}[data-popper-placement*="top"] .${tooltipClasses.tooltip}`]:
				{
					marginBottom: 8,
				},
			[`&.${tooltipClasses.popper}[data-popper-placement*="right"] .${tooltipClasses.tooltip}`]:
				{
					marginLeft: 8,
				},
			[`&.${tooltipClasses.popper}[data-popper-placement*="left"] .${tooltipClasses.tooltip}`]:
				{
					marginRight: 8,
				},
		},
	},
};

// ----------------------------------------------------------------------

export const tooltip = { MuiTooltip };
