import { inputLabelClasses } from "@mui/material/InputLabel";
import type { Components, Theme } from "@mui/material/styles";

// ----------------------------------------------------------------------

const MuiFormLabel: Components<Theme>["MuiFormLabel"] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => {
			return {
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
						transform: "translate(12px, 6px) scale(0.75)",
					},
				},
			};
		},
	},
};

// ----------------------------------------------------------------------

const MuiFormHelperText: Components<Theme>["MuiFormHelperText"] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: { component: "div" },

	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => {
			return { marginTop: theme.spacing(1) };
		},
	},
};

// ----------------------------------------------------------------------

const MuiFormControlLabel: Components<Theme>["MuiFormControlLabel"] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		label: ({ theme }) => {
			return { ...theme.typography.body2 };
		},
	},
};

// ----------------------------------------------------------------------

export const form = { MuiFormLabel, MuiFormHelperText, MuiFormControlLabel };
