import { filledInputClasses } from '@mui/material/FilledInput';
import { inputBaseClasses } from '@mui/material/InputBase';
import { outlinedInputClasses } from '@mui/material/OutlinedInput';
import type { Components, Theme } from '@mui/material/styles';
import { varAlpha } from 'minimal-shared/utils';

// ----------------------------------------------------------------------

const MuiInputBase: Components<Theme>['MuiInputBase'] = {
	/** **************************************
	 * DEFAULT PROPS - Metronic uses small/medium sizes
	 *************************************** */
	defaultProps: {
		size: 'small',
	},
	/** **************************************
	 * STYLE
	 * Metronic-inspired compact input styling
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			[`&.${inputBaseClasses.disabled}`]: {
				'& svg': { color: theme.vars.palette.text.disabled },
			},
			[`& .${inputBaseClasses.input}:focus`]: { borderRadius: 'inherit' },
		}),
		input: ({ theme }) => ({
			fontSize: theme.typography.pxToRem(13), // Metronic: text-[0.8125rem] (13px)
			fontWeight: 400,
			letterSpacing: '-0.006em',
			padding: '7px 12px', // Metronic: px-3 py-1.5
			// Make input fill parent height to prevent autofill background gaps
			height: '100%',
			boxSizing: 'border-box',
			'&::placeholder': {
				opacity: 0.8, // Metronic: placeholder:text-muted-foreground/80
				color: theme.vars.palette.text.disabled,
				fontWeight: 400,
			},
			// Autofill styles to remove browser's default yellow/blue background
			// Uses transparent box-shadow and inherits text color
			'&:-webkit-autofill, &:-webkit-autofill:hover, &:-webkit-autofill:focus, &:-webkit-autofill:active':
				{
					WebkitBoxShadow: '0 0 0 1000px transparent inset !important',
					boxShadow: '0 0 0 1000px transparent inset !important',
					WebkitTextFillColor: 'inherit !important',
					caretColor: 'inherit',
					// Long transition effectively prevents autofill background from ever showing
					transition: 'background-color 600000s 0s, color 600000s 0s',
					borderRadius: 'inherit',
				},
		}),
		inputSizeSmall: {
			fontSize: '0.75rem', // 12px - text-xs
			padding: '5px 10px', // Metronic: px-2.5
		},
	},
};

// ----------------------------------------------------------------------

const MuiInput: Components<Theme>['MuiInput'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		underline: ({ theme }) => ({
			'&::before': {
				borderBottomColor: varAlpha(
					theme.vars.palette.grey['500Channel'],
					0.32,
				),
			},
			'&::after': { borderBottomColor: theme.vars.palette.text.primary },
		}),
	},
};

// ----------------------------------------------------------------------

const MuiOutlinedInput: Components<Theme>['MuiOutlinedInput'] = {
	/** **************************************
	 * STYLE
	 * Metronic-inspired compact input styling
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			backgroundColor: theme.vars.palette.background.paper,
			boxShadow: theme.vars.customShadows.z1,
			borderRadius: theme.shape.borderRadius,
			// Keep adornments (icons) vertically centered
			alignItems: 'center',
			[`&.${outlinedInputClasses.focused}`]: {
				[`& .${outlinedInputClasses.notchedOutline}`]: {
					borderColor: theme.vars.palette.primary.main,
					borderWidth: '2px',
				},
			},
			[`&.${outlinedInputClasses.error}`]: {
				[`& .${outlinedInputClasses.notchedOutline}`]: {
					borderColor: theme.vars.palette.error.main,
				},
			},
			[`&.${outlinedInputClasses.disabled}`]: {
				backgroundColor: theme.vars.palette.grey[100],
				[`& .${outlinedInputClasses.notchedOutline}`]: {
					borderColor: theme.vars.palette.action.disabledBackground,
				},
				...theme.applyStyles('dark', {
					backgroundColor: theme.vars.palette.grey[800],
				}),
			},
		}),
		notchedOutline: ({ theme }) => ({
			borderColor: theme.vars.palette.grey[300],
			borderWidth: '1px',
			transition: theme.transitions.create(['border-color'], {
				duration: theme.transitions.duration.shortest,
			}),
			...theme.applyStyles('dark', {
				borderColor: theme.vars.palette.grey[600],
			}),
		}),
		// Metronic compact sizes
		// Using height instead of minHeight for single-line inputs so child input can use height: 100%
		// For multi-select with chips, use multiline variant which has different styling
		sizeSmall: {
			[`&:not(.${outlinedInputClasses.multiline})`]: {
				height: 34, // Metronic: h-8.5
			},
		},
		input: {
			padding: '7px 12px', // Compact padding
			// Stretch input to fill container height (for autofill background coverage)
			// while adornments stay centered via alignItems: 'center' on root
			alignSelf: 'stretch',
			height: '100%',
			boxSizing: 'border-box',
		},
		inputSizeSmall: {
			padding: '5px 10px', // Even more compact for small
			alignSelf: 'stretch',
			height: '100%',
			boxSizing: 'border-box',
		},
		// Reset padding on multiline root - padding will be on the textarea only
		multiline: {
			padding: 0,
		},
		// Ensure multiline inputs have consistent padding with single-line inputs
		inputMultiline: {
			padding: '7px 12px',
		},
	},
};

// ----------------------------------------------------------------------

const MuiFilledInput: Components<Theme>['MuiFilledInput'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: { disableUnderline: true },

	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			borderRadius: theme.shape.borderRadius,
			backgroundColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.08),
			'&:hover': {
				backgroundColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.16),
			},
			[`&.${filledInputClasses.focused}`]: {
				backgroundColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.16),
			},
			[`&.${filledInputClasses.error}`]: {
				backgroundColor: varAlpha(theme.vars.palette.error.mainChannel, 0.08),
				[`&.${filledInputClasses.focused}`]: {
					backgroundColor: varAlpha(theme.vars.palette.error.mainChannel, 0.16),
				},
			},
			[`&.${filledInputClasses.disabled}`]: {
				backgroundColor: theme.vars.palette.action.disabledBackground,
			},
		}),
	},
};

const MuiTextField: Components<Theme>['MuiTextField'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: { variant: 'outlined' },

	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {},
};

// ----------------------------------------------------------------------

export const textfield = {
	MuiInput,
	MuiInputBase,
	MuiFilledInput,
	MuiOutlinedInput,
	MuiTextField,
};
