import { switchClasses } from '@mui/material/Switch';
import type { Components, Theme } from '@mui/material/styles';
import { varAlpha } from 'minimal-shared/utils';

// ----------------------------------------------------------------------

/**
 * Compact Switch with size variants
 * - sizeMedium: 40×24px (compact default)
 * - sizeSmall: 32×18px (even more compact)
 */
const MuiSwitch: Components<Theme>['MuiSwitch'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: { alignItems: 'center' },
		switchBase: ({ ownerState, theme }) => ({
			padding: 2,
			[`&.${switchClasses.checked}`]: {
				[`& .${switchClasses.thumb}`]: {
					...(ownerState.color === 'default' && {
						...theme.applyStyles('dark', {
							color: theme.vars.palette.grey[800],
						}),
					}),
				},
				[`&+.${switchClasses.track}`]: {
					opacity: 1,
					...(ownerState.color === 'default' && {
						backgroundColor: theme.vars.palette.text.primary,
					}),
				},
			},
			[`&.${switchClasses.disabled}`]: {
				[`& .${switchClasses.thumb}`]: {
					opacity: 1,
					...theme.applyStyles('dark', {
						opacity: 0.48,
					}),
				},
				[`&+.${switchClasses.track}`]: { opacity: 0.48 },
			},
		}),
		track: ({ theme }) => ({
			opacity: 1,
			borderRadius: 12,
			backgroundColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.48),
			...theme.applyStyles('dark', {
				backgroundColor: theme.vars.palette.grey[700],
			}),
		}),
		thumb: ({ theme }) => ({
			color: theme.vars.palette.common.white,
			boxShadow: 'none',
		}),
		/**
		 * @size medium - compact (40×24px)
		 */
		sizeMedium: {
			width: 40,
			height: 24,
			padding: 0,
			[`& .${switchClasses.switchBase}`]: {
				[`&.${switchClasses.checked}`]: {
					transform: 'translateX(16px)',
				},
			},
			[`& .${switchClasses.track}`]: {
				width: '100%',
				height: '100%',
				borderRadius: 12,
			},
			[`& .${switchClasses.thumb}`]: { width: 20, height: 20 },
		},
		/**
		 * @size small - more compact (28×16px)
		 */
		sizeSmall: {
			width: 28,
			height: 16,
			padding: 0,
			[`& .${switchClasses.switchBase}`]: {
				padding: 2,
				[`&.${switchClasses.checked}`]: {
					transform: 'translateX(12px)',
				},
			},
			[`& .${switchClasses.track}`]: {
				width: '100%',
				height: '100%',
				borderRadius: 8,
			},
			[`& .${switchClasses.thumb}`]: { width: 12, height: 12 },
		},
	},
};

// ----------------------------------------------------------------------

export const switches = { MuiSwitch };
