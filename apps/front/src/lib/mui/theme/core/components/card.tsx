import type { Components, Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

const MuiCard: Components<Theme>['MuiCard'] = {
	/** **************************************
	 * STYLE
	 * Metronic-inspired card styling:
	 * - borderRadius: 1.5 (9px with 6px base) - sharper than original
	 * - border: 1px solid gray.200
	 * - boxShadow: very subtle
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			position: 'relative',
			boxShadow: theme.vars.customShadows.card,
			borderRadius: Number(theme.shape.borderRadius) * 1.5, // 9px - sharper
			border: `1px solid ${theme.vars.palette.grey[200]}`,
			backgroundColor: theme.vars.palette.background.paper,
			zIndex: 0,
			transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
			...theme.applyStyles('dark', {
				border: `1px solid ${theme.vars.palette.grey[700]}`,
			}),
		}),
	},
};

// ----------------------------------------------------------------------

const MuiCardHeader: Components<Theme>['MuiCardHeader'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: {
		titleTypographyProps: { variant: 'subtitle1' }, // Smaller than h6
		subheaderTypographyProps: { variant: 'body2', marginTop: '2px' },
	},

	/** **************************************
	 * STYLE - Metronic compact padding (px-5 min-h-14)
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			padding: theme.spacing(2, 2.5, 0), // Reduced from 3,3,0
			minHeight: 48, // Metronic: min-h-12 to min-h-14
		}),
		title: ({ theme }) => ({
			fontSize: theme.typography.pxToRem(14), // Smaller title
			fontWeight: 600,
		}),
	},
};

// ----------------------------------------------------------------------

const MuiCardContent: Components<Theme>['MuiCardContent'] = {
	/** **************************************
	 * STYLE - Metronic: p-5 (20px), we use 16px for more compact
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			padding: theme.spacing(2, 2.5), // Reduced from 3 (24px) to 2 (16px)
			'&:last-child': {
				paddingBottom: theme.spacing(2.5),
			},
		}),
	},
};

// ----------------------------------------------------------------------

export const card = { MuiCard, MuiCardHeader, MuiCardContent };
