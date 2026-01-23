import type { Components, CSSObject, Theme } from '@mui/material/styles';
import type { ToggleButtonProps } from '@mui/material/ToggleButton';
import { toggleButtonClasses } from '@mui/material/ToggleButton';
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

function styleColors(
	ownerState: ToggleButtonProps,
	styles: (val: PaletteColor) => CSSObject,
) {
	const outputStyle = COLORS.reduce((acc, color) => {
		if (!ownerState.disabled && ownerState.color === color) {
			acc = styles(color);
		}
		return acc;
	}, {});

	return outputStyle;
}

// ----------------------------------------------------------------------

const MuiToggleButton: Components<Theme>['MuiToggleButton'] = {
	/** **************************************
	 * STYLE
	 * Compact with restored color variants and selected state
	 *************************************** */
	styleOverrides: {
		root: ({ theme, ownerState }) => {
			const styled = {
				colors: styleColors(ownerState, (color) => ({
					'&:hover': {
						borderColor: varAlpha(theme.vars.palette[color].mainChannel, 0.48),
						backgroundColor: varAlpha(
							theme.vars.palette[color].mainChannel,
							theme.vars.palette.action.hoverOpacity,
						),
					},
				})),
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
				gap: 6,
				textTransform: 'inherit',
				fontWeight: theme.typography.fontWeightSemiBold,
				...styled.colors,
				...styled.selected,
				...styled.disabled,
			};
		},
		sizeSmall: ({ theme }) => ({
			paddingTop: theme.spacing(0.25),
			paddingBottom: theme.spacing(0.25),
			paddingLeft: theme.spacing(1),
			paddingRight: theme.spacing(1),
		}),
	},
};

// ----------------------------------------------------------------------

const MuiToggleButtonGroup: Components<Theme>['MuiToggleButtonGroup'] = {
	/** **************************************
	 * STYLE
	 * Compact with background
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			gap: 4,
			padding: 4,
			backgroundColor: theme.vars.palette.background.paper,
			border: `solid 1px ${varAlpha(theme.vars.palette.grey['500Channel'], 0.08)}`,
			...theme.applyStyles('dark', {
				backgroundColor: theme.vars.palette.background.paper,
			}),
		}),
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
