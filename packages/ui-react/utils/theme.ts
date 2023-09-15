import { alpha, createTheme, CustomShadowOptions, PaletteOptions, ThemeOptions } from '@mui/material';
import { TypographyOptions } from '@mui/material/styles/createTypography';

import { getResponsiveFontSizes, pxToRem } from './styles';

const {
	palette: { augmentColor },
} = createTheme();

// --------------------------------------------------------------------------------------//
//                                       Palette                                        //
// --------------------------------------------------------------------------------------//

const rawColors = {
	// === main colors
	purple: '#7703fc',
	pink: '#e32b6b',
	blue: '#0398e2',
	green: '#38c79c',
	orange: '#faad42',
	red: '#e62864',
	// == text colors
	lightGrey: '#a3a6b9',
	mediumGrey: '#747990',
	darkGrey: '#283252',
};

const iPalette = {
	primary: augmentColor({ color: { main: rawColors.purple } }),
	secondary: augmentColor({ color: { main: rawColors.pink } }),
	info: augmentColor({ color: { main: rawColors.blue } }),
	success: augmentColor({ color: { main: rawColors.green } }),
	warning: augmentColor({ color: { main: rawColors.orange } }),
	error: augmentColor({ color: { main: rawColors.red } }),
	text: {
		primary: rawColors.mediumGrey,
		// secondary: rawColors.darkGrey, // ?
		disabled: rawColors.lightGrey,
	},
	grey: {
		300: rawColors.lightGrey,
		500: rawColors.mediumGrey,
		800: rawColors.darkGrey,
	},
};

const palette: PaletteOptions = iPalette;

// --------------------------------------------------------------------------------------//
//                                      Typography                                      //
// --------------------------------------------------------------------------------------//

// eslint-disable-next-line quotes
const PRIMARY_FONT = ["'Roboto'", 'sans-serif'].join(', ');
// eslint-disable-next-line quotes
const TITLE_FONT = ["'Montserrat'", 'sans-serif'].join(', ');
const defaultTypographyStyles = {
	lineHeight: 1,
	fontWeight: 400,
	fontStyle: 'normal',
	fontFamily: PRIMARY_FONT,
};

const titleTypographyStyles = {
	...defaultTypographyStyles,
	fontFamily: TITLE_FONT,
	color: palette.grey?.[800],
};

const typography: TypographyOptions = {
	fontFamily: PRIMARY_FONT,
	fontWeightRegular: 400,
	fontWeightMedium: 500,
	fontWeightSemiBold: 600,
	fontWeightBold: 700,
	h1: {
		...titleTypographyStyles,
		fontWeight: 700,
		lineHeight: 80 / 64,
		fontSize: pxToRem(40),
		letterSpacing: 2,
		...getResponsiveFontSizes({ sm: 52, md: 58, lg: 64 }),
	},
	h2: {
		...titleTypographyStyles,
		fontWeight: 700,
		lineHeight: 64 / 48,
		fontSize: pxToRem(32),
		...getResponsiveFontSizes({ sm: 40, md: 44, lg: 48 }),
	},
	h3: {
		...titleTypographyStyles,
		fontWeight: 700,
		lineHeight: 1.5,
		fontSize: pxToRem(24),
		...getResponsiveFontSizes({ sm: 26, md: 30, lg: 32 }),
	},
	h4: {
		...titleTypographyStyles,
		fontWeight: 700,
		lineHeight: 1.5,
		fontSize: pxToRem(20),
		...getResponsiveFontSizes({ sm: 20, md: 24, lg: 24 }),
	},
	h5: {
		...titleTypographyStyles,
		fontWeight: 700,
		lineHeight: 1.5,
		fontSize: pxToRem(18),
		...getResponsiveFontSizes({ sm: 19, md: 20, lg: 20 }),
	},
	h6: {
		...titleTypographyStyles,
		fontWeight: 700,
		lineHeight: 28 / 18,
		fontSize: pxToRem(17),
		...getResponsiveFontSizes({ sm: 18, md: 18, lg: 18 }),
	},
	subtitle1: {
		...defaultTypographyStyles,
		fontWeight: 600,
		lineHeight: 1.5,
		fontSize: pxToRem(16),
	},
	subtitle2: {
		...defaultTypographyStyles,
		fontWeight: 600,
		lineHeight: 22 / 14,
		fontSize: pxToRem(14),
	},
	body1: {
		...defaultTypographyStyles,
		lineHeight: 1.5,
		fontSize: pxToRem(16),
	},
	body2: {
		...defaultTypographyStyles,
		lineHeight: 22 / 14,
		fontSize: pxToRem(14),
	},
	caption: {
		...defaultTypographyStyles,
		lineHeight: 1.5,
		fontSize: pxToRem(12),
	},
	overline: {
		...defaultTypographyStyles,
		fontWeight: 700,
		lineHeight: 1.5,
		fontSize: pxToRem(12),
		textTransform: 'uppercase',
	},
	button: {
		...defaultTypographyStyles,
		fontWeight: 700,
		lineHeight: 24 / 14,
		fontSize: pxToRem(14),
		textTransform: 'capitalize',
	},
};

// --------------------------------------------------------------------------------------//
//                                    Custom shadows                                    //
// --------------------------------------------------------------------------------------//

// eslint-disable-next-line @typescript-eslint/no-shadow
const createShadow = (color: string) => {
	const transparent = (opacity: number) => {
		return alpha(color, opacity);
	};

	return {
		z1: `0 1px 2px 0 ${transparent(0.04)}`,
		z4: `-4px 4px 12px 0 ${transparent(0.08)}`,
		z8: `-8px 8px 24px -4px ${transparent(0.08)}`,
		z12: `-12px 12px 36px -4px ${transparent(0.12)}`,
		z16: `-16px 16px 48px -8px ${transparent(0.16)}`,
		z20: `-20px 20px 60px -8px ${transparent(0.2)}`,
		z24: `-24px 24px 72px -8px ${transparent(0.24)}`,
		// ====
		primary: `0 8px 16px 0 ${alpha(iPalette.primary.main, 0.24)}`,
		info: `0 8px 16px 0 ${alpha(iPalette.info.main, 0.24)}`,
		secondary: `0 8px 16px 0 ${alpha(iPalette.secondary.main, 0.24)}`,
		success: `0 8px 16px 0 ${alpha(iPalette.success.main, 0.24)}`,
		warning: `0 8px 16px 0 ${alpha(iPalette.warning.main, 0.24)}`,
		error: `0 8px 16px 0 ${alpha(iPalette.error.main, 0.24)}`,
		// ====
		card: `0 0 2px 0 ${alpha(color, 0.2)}, 0 12px 24px -4px ${alpha(color, 0.12)}`,
		dialog: `-40px 40px 80px -8px ${alpha(color, 0.24)}`,
		dropdown: `0 0 2px 0 ${alpha(color, 0.24)}, -20px 20px 40px -4px ${alpha(color, 0.24)}`,
	};
};

const customShadows: CustomShadowOptions = createShadow(iPalette.grey[500]);

// --------------------------------------------------------------------------------------//
//                                     Theme Options                                     //
// --------------------------------------------------------------------------------------//
export const themeOptions: ThemeOptions = {
	palette,
	typography,
	customShadows,
	breakpoints: {
		// These are already the defaults
		// values: {
		// 	xs: 0,
		// 	sm: 600,
		// 	md: 900,
		// 	lg: 1200,
		// 	xl: 1536,
		// },
	},
	components: {
		// MuiButton: {
		// 	styleOverrides: {
		// 		root: ({ ownerState, theme }) => {
		// 			const getShadow = (color: string) => {
		// 				const lightenedColor = lighten(color, 0.2);
		// 				return `${alpha(lightenedColor, 0.42)} 0px 14px 26px -12px, rgba(0, 0, 0, 0.12) 0px 4px 23px 0px, ${alpha(
		// 					lightenedColor,
		// 					0.2,
		// 				)} 0px 8px 10px -5px`;
		// 			};
		// 			return {
		// 				borderRadius: pxToRem(10.4),
		// 				...(ownerState.variant === 'contained' && {
		// 					boxShadow: 'none',
		// 					'&:hover': {
		// 						boxShadow: ownerState.color ? getShadow((theme.palette as any)[ownerState.color].main) : 'none',
		// 					},
		// 				}),
		// 				...(ownerState.raised
		// 					? {
		// 							boxShadow: ownerState.color ? getShadow((theme.palette as any)[ownerState.color].main) : 'none',
		// 					  }
		// 					: {}),
		// 			};
		// 		},
		// 	},
		// },
	},
};
