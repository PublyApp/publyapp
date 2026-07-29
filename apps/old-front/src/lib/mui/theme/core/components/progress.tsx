import type { LinearProgressProps } from '@mui/material/LinearProgress';
import type { Components, CSSObject, Theme } from '@mui/material/styles';
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
	ownerState: LinearProgressProps,
	styles: (val: PaletteColor) => CSSObject,
) => {
	for (const color of COLORS) {
		if (ownerState.color === color) {
			return styles(color);
		}
	}

	return {};
};

const MuiLinearProgress: Components<Theme>['MuiLinearProgress'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme, ownerState }) => {
			const styled = {
				colors: styleColors(ownerState, (color) => {
					return {
						backgroundColor: varAlpha(
							theme.vars.palette[color].mainChannel,
							0.24,
						),
					};
				}),
				inheritColor: {
					...(ownerState.color === 'inherit' && {
						'&::before': { display: 'none' },
						backgroundColor: varAlpha(
							theme.vars.palette.text.primaryChannel,
							0.24,
						),
					}),
				},
			};
			return {
				borderRadius: 4,
				...(ownerState.variant !== 'buffer' && {
					...styled.inheritColor,
					...styled.colors,
				}),
			};
		},
		bar: { borderRadius: 'inherit' },
	},
};

// ----------------------------------------------------------------------

export const progress = { MuiLinearProgress };
