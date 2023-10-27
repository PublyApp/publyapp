import {
	alpha,
	createTheme,
	lighten,
	type CustomShadowOptions,
	type PaletteOptions,
	type Shadows,
	type ThemeOptions,
} from '@mui/material';
import type { TypographyOptions } from '@mui/material/styles/createTypography';

import { getResponsiveFontSizes, pxToRem } from '../utils/css.utils';

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
	background: {
		neutral: lighten(rawColors.lightGrey, 0.8),
		// neutral: alpha(rawColors.lightGrey, 0.5),
	},
};

const palette: PaletteOptions = iPalette;

// --------------------------------------------------------------------------------------//
//                                      Typography                                      //
// --------------------------------------------------------------------------------------//

const PRIMARY_FONT = ["'Roboto'", 'sans-serif'].join(', ');
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

const createCustomShadows = (color: string): CustomShadowOptions => {
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

const customShadows = createCustomShadows(iPalette.grey[500]);

// --------------------------------------------------------------------------------------//
//                                       shadows                                        //
// --------------------------------------------------------------------------------------//
const createShadows = (color: string): Shadows => {
	const transparent1 = alpha(color, 0.2);
	const transparent2 = alpha(color, 0.14);
	const transparent3 = alpha(color, 0.12);

	return [
		'none',
		`0px 2px 1px -1px ${transparent1},0px 1px 1px 0px ${transparent2},0px 1px 3px 0px ${transparent3}`,
		`0px 3px 1px -2px ${transparent1},0px 2px 2px 0px ${transparent2},0px 1px 5px 0px ${transparent3}`,
		`0px 3px 3px -2px ${transparent1},0px 3px 4px 0px ${transparent2},0px 1px 8px 0px ${transparent3}`,
		`0px 2px 4px -1px ${transparent1},0px 4px 5px 0px ${transparent2},0px 1px 10px 0px ${transparent3}`,
		`0px 3px 5px -1px ${transparent1},0px 5px 8px 0px ${transparent2},0px 1px 14px 0px ${transparent3}`,
		`0px 3px 5px -1px ${transparent1},0px 6px 10px 0px ${transparent2},0px 1px 18px 0px ${transparent3}`,
		`0px 4px 5px -2px ${transparent1},0px 7px 10px 1px ${transparent2},0px 2px 16px 1px ${transparent3}`,
		`0px 5px 5px -3px ${transparent1},0px 8px 10px 1px ${transparent2},0px 3px 14px 2px ${transparent3}`,
		`0px 5px 6px -3px ${transparent1},0px 9px 12px 1px ${transparent2},0px 3px 16px 2px ${transparent3}`,
		`0px 6px 6px -3px ${transparent1},0px 10px 14px 1px ${transparent2},0px 4px 18px 3px ${transparent3}`,
		`0px 6px 7px -4px ${transparent1},0px 11px 15px 1px ${transparent2},0px 4px 20px 3px ${transparent3}`,
		`0px 7px 8px -4px ${transparent1},0px 12px 17px 2px ${transparent2},0px 5px 22px 4px ${transparent3}`,
		`0px 7px 8px -4px ${transparent1},0px 13px 19px 2px ${transparent2},0px 5px 24px 4px ${transparent3}`,
		`0px 7px 9px -4px ${transparent1},0px 14px 21px 2px ${transparent2},0px 5px 26px 4px ${transparent3}`,
		`0px 8px 9px -5px ${transparent1},0px 15px 22px 2px ${transparent2},0px 6px 28px 5px ${transparent3}`,
		`0px 8px 10px -5px ${transparent1},0px 16px 24px 2px ${transparent2},0px 6px 30px 5px ${transparent3}`,
		`0px 8px 11px -5px ${transparent1},0px 17px 26px 2px ${transparent2},0px 6px 32px 5px ${transparent3}`,
		`0px 9px 11px -5px ${transparent1},0px 18px 28px 2px ${transparent2},0px 7px 34px 6px ${transparent3}`,
		`0px 9px 12px -6px ${transparent1},0px 19px 29px 2px ${transparent2},0px 7px 36px 6px ${transparent3}`,
		`0px 10px 13px -6px ${transparent1},0px 20px 31px 3px ${transparent2},0px 8px 38px 7px ${transparent3}`,
		`0px 10px 13px -6px ${transparent1},0px 21px 33px 3px ${transparent2},0px 8px 40px 7px ${transparent3}`,
		`0px 10px 14px -6px ${transparent1},0px 22px 35px 3px ${transparent2},0px 8px 42px 7px ${transparent3}`,
		`0px 11px 14px -7px ${transparent1},0px 23px 36px 3px ${transparent2},0px 9px 44px 8px ${transparent3}`,
		`0px 11px 15px -7px ${transparent1},0px 24px 38px 3px ${transparent2},0px 9px 46px 8px ${transparent3}`,
	];
};

const shadows = createShadows(iPalette.grey[500]);

// --------------------------------------------------------------------------------------//
//                                     Theme Options                                     //
// --------------------------------------------------------------------------------------//
export const themeOptions: ThemeOptions = {
	palette,
	typography,
	customShadows,
	shadows,
	shape: { borderRadius: 8 },
	// breakpoints: {
	// These are already the defaults
	// values: {
	// 	xs: 0,
	// 	sm: 600,
	// 	md: 900,
	// 	lg: 1200,
	// 	xl: 1536,
	// },
	// },
};
