import { inputLabelClasses } from '@mui/material/InputLabel';
import type { Components, Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

const MuiInputLabel: Components<Theme>['MuiInputLabel'] = {
	/** **************************************
	 * STYLE
	 * Fix vertical alignment with custom input padding
	 *************************************** */
	styleOverrides: {
		root: {
			// Adjust positioning to align with input padding
			[`&:not(.${inputLabelClasses.shrink})`]: {
				transform: 'translate(14px, 8px) scale(1)', // Align with input's 7px padding + 1px for visual balance
			},
		},
		sizeSmall: {
			[`&:not(.${inputLabelClasses.shrink})`]: {
				transform: 'translate(14px, 6px) scale(1)', // Align with small input's 5px padding + 1px
			},
		},
		outlined: {
			[`&.${inputLabelClasses.shrink}`]: {
				transform: 'translate(14px, -9px) scale(0.75)', // Standard MUI shrunk position
			},
		},
	},
};

// ----------------------------------------------------------------------

const MuiFormLabel: Components<Theme>['MuiFormLabel'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			...theme.typography.body2,
			color: theme.vars.palette.text.disabled,
			[`&.${inputLabelClasses.shrink}`]: {
				...theme.typography.body1,
				fontWeight: 600,
				color: theme.vars.palette.text.secondary,
				[`&.${inputLabelClasses.focused}`]: {
					color: theme.vars.palette.text.primary,
				},
				[`&.${inputLabelClasses.error}`]: {
					color: theme.vars.palette.error.main,
				},
				[`&.${inputLabelClasses.disabled}`]: {
					color: theme.vars.palette.text.disabled,
				},
				[`&.${inputLabelClasses.filled}`]: {
					transform: 'translate(12px, 6px) scale(0.75)',
				},
			},
		}),
	},
};

// ----------------------------------------------------------------------

const MuiFormHelperText: Components<Theme>['MuiFormHelperText'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: { component: 'div' },

	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: { root: ({ theme }) => ({ marginTop: theme.spacing(1) }) },
};

// ----------------------------------------------------------------------

const MuiFormControlLabel: Components<Theme>['MuiFormControlLabel'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: { label: ({ theme }) => ({ ...theme.typography.body2 }) },
};

// ----------------------------------------------------------------------

export const form = {
	MuiInputLabel,
	MuiFormLabel,
	MuiFormHelperText,
	MuiFormControlLabel,
};
