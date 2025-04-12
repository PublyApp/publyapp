import type { Components, CSSObject, Theme } from '@mui/material/styles';
import {
	toggleButtonClasses,
	type ToggleButtonProps,
} from '@mui/material/ToggleButton';
import { varAlpha } from 'minimal-shared/utils';

// ----------------------------------------------------------------------

const COLORS = [
	'primary',
	'secondary',
	'info',
	'success',
	'warning',
	'error',
] as const;

type PaletteColor = (typeof COLORS)[number];

// ----------------------------------------------------------------------

const styleColors = (
	ownerState: ToggleButtonProps,
	styles: (val: PaletteColor) => CSSObject,
) => {
	const outputStyle = COLORS.reduce((acc, color) => {
		if (!ownerState.disabled && ownerState.color === color) {
			// biome-ignore lint/style/noParameterAssign: code from template leave as is for now:
			acc = styles(color);
		}

		return acc;
	}, {});

	return outputStyle;
};

// ----------------------------------------------------------------------

const MuiToggleButton: Components<Theme>['MuiToggleButton'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme, ownerState }) => {
			const styled = {
				colors: styleColors(ownerState, (color) => {
					return {
						'&:hover': {
							borderColor: varAlpha(
								theme.vars.palette[color].mainChannel,
								0.48,
							),
							backgroundColor: varAlpha(
								theme.vars.palette[color].mainChannel,
								theme.vars.palette.action.hoverOpacity,
							),
						},
					};
				}),
				selected: {
					[`&.${toggleButtonClasses.selected}`]: {
						borderColor: 'currentColor',
						boxShadow: '0 0 0 0.75px currentColor',
					},
				},
				disabled: {
					...(ownerState.disabled && {
						[`&.${toggleButtonClasses.selected}`]: {
							color: theme.vars.palette.action.disabled,
							backgroundColor: theme.vars.palette.action.selected,
							borderColor: theme.vars.palette.action.disabledBackground,
						},
					}),
				},
			};

			return {
				fontWeight: theme.typography.fontWeightSemiBold,
				...styled.colors,
				...styled.selected,
				...styled.disabled,
			};
		},
	},
};

// ----------------------------------------------------------------------

const MuiToggleButtonGroup: Components<Theme>['MuiToggleButtonGroup'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => {
			return {
				gap: 4,
				padding: 4,
				border: `solid 1px ${varAlpha(theme.vars.palette.grey['500Channel'], 0.08)}`,
			};
		},
		grouped: {
			[`&.${toggleButtonClasses.root}`]: {
				border: 'none',
				borderRadius: 'inherit',
			},
			[`&.${toggleButtonClasses.selected}`]: { boxShadow: 'none' },
		},
	},
};

// ----------------------------------------------------------------------

export const toggleButton = { MuiToggleButton, MuiToggleButtonGroup };
