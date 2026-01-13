import type { Theme, Components } from '@mui/material/styles';

import { varAlpha } from 'minimal-shared/utils';

import { stepConnectorClasses } from '@mui/material/StepConnector';

// ----------------------------------------------------------------------

const MuiStepConnector: Components<Theme>['MuiStepConnector'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		line: ({ theme }) => ({
			borderColor: theme.vars.palette.divider,
			borderTopWidth: 2,
		}),
		root: ({ theme }) => ({
			[`&.${stepConnectorClasses.completed}`]: {
				[`& .${stepConnectorClasses.line}`]: {
					borderColor: theme.vars.palette.primary.main,
				},
			},
			[`&.${stepConnectorClasses.active}`]: {
				[`& .${stepConnectorClasses.line}`]: {
					borderColor: theme.vars.palette.primary.main,
				},
			},
		}),
	},
};

const MuiStepLabel: Components<Theme>['MuiStepLabel'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		label: ({ theme }) => ({
			...theme.typography.body2,
			fontWeight: theme.typography.fontWeightMedium,
			[`&.Mui-active`]: {
				fontWeight: theme.typography.fontWeightSemiBold,
				color: theme.vars.palette.text.primary,
			},
			[`&.Mui-completed`]: {
				fontWeight: theme.typography.fontWeightMedium,
				color: theme.vars.palette.text.primary,
			},
		}),
		iconContainer: ({ theme }) => ({
			'& .MuiStepIcon-root': {
				width: 28,
				height: 28,
				'&.Mui-active': {
					color: theme.vars.palette.primary.main,
				},
				'&.Mui-completed': {
					color: theme.vars.palette.primary.main,
				},
			},
		}),
	},
};

const MuiStepIcon: Components<Theme>['MuiStepIcon'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			color: varAlpha(theme.vars.palette.grey['500Channel'], 0.24),
			'&.Mui-active': {
				color: theme.vars.palette.primary.main,
			},
			'&.Mui-completed': {
				color: theme.vars.palette.primary.main,
			},
		}),
		text: ({ theme }) => ({
			fontSize: theme.typography.caption.fontSize,
			fontWeight: theme.typography.fontWeightSemiBold,
		}),
	},
};

const MuiStepper: Components<Theme>['MuiStepper'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			gap: theme.spacing(0.5),
		}),
	},
};

// ----------------------------------------------------------------------

export const stepper = {
	MuiStepConnector,
	MuiStepLabel,
	MuiStepIcon,
	MuiStepper,
};
