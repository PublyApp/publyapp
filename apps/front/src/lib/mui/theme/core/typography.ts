import type {
	Breakpoint,
	CSSObject,
	TypographyVariantsOptions,
} from '@mui/material/styles';
import { createTheme as getTheme } from '@mui/material/styles';
import { pxToRem, setFont } from 'minimal-shared/utils';

import { themeConfig } from '../theme-config';

// ----------------------------------------------------------------------

/**
 * TypeScript (type definition and extension)
 * @to {@link file://./../extend-theme-types.d.ts}
 */
export type FontStyleExtend = {
	fontWeightSemiBold: CSSObject['fontWeight'];
	fontSecondaryFamily: CSSObject['fontFamily'];
};

export type ResponsiveFontSizesInput = Partial<Record<Breakpoint, number>>;
export type ResponsiveFontSizesResult = Record<string, { fontSize: string }>;

const defaultMuiTheme = getTheme();

function responsiveFontSizes(
	obj: ResponsiveFontSizesInput,
): ResponsiveFontSizesResult {
	const breakpoints: Breakpoint[] = defaultMuiTheme.breakpoints.keys;

	return breakpoints.reduce((acc, breakpoint) => {
		const value = obj[breakpoint];

		if (value !== undefined && value >= 0) {
			acc[defaultMuiTheme.breakpoints.up(breakpoint)] = {
				fontSize: pxToRem(value),
			};
		}

		return acc;
	}, {} as ResponsiveFontSizesResult);
}

// ----------------------------------------------------------------------

const primaryFont = setFont(themeConfig.fontFamily.primary);
const secondaryFont = setFont(themeConfig.fontFamily.secondary);

/**
 * Typography scale - Metronic-inspired compact sizing
 * Key characteristics:
 * - Base font size: 13px (Metronic uses text-[0.8125rem])
 * - Compact headings
 * - Tight line heights
 */
export const typography: TypographyVariantsOptions = {
	fontFamily: primaryFont,
	fontSecondaryFamily: secondaryFont,
	fontWeightLight: '300',
	fontWeightRegular: '400',
	fontWeightMedium: '500',
	fontWeightSemiBold: '600',
	fontWeightBold: '700',
	// Compact heading scale
	h1: {
		fontFamily: primaryFont,
		fontWeight: 600,
		lineHeight: 1.2,
		fontSize: pxToRem(22), // Reduced from 24
		...responsiveFontSizes({ sm: 24, md: 28, lg: 32 }),
	},
	h2: {
		fontFamily: primaryFont,
		fontWeight: 600,
		lineHeight: 1.25,
		fontSize: pxToRem(18), // Reduced from 20
		...responsiveFontSizes({ sm: 20, md: 22, lg: 24 }),
	},
	h3: {
		fontFamily: primaryFont,
		fontWeight: 600,
		lineHeight: 1.3,
		letterSpacing: 0,
		fontSize: pxToRem(15), // Reduced from 16
		...responsiveFontSizes({ sm: 16, md: 17, lg: 18 }),
	},
	h4: {
		fontWeight: 600,
		lineHeight: 1.4,
		letterSpacing: 0,
		fontSize: pxToRem(14), // Metronic card title: text-base font-semibold
	},
	h5: {
		fontWeight: 600,
		lineHeight: 1.4,
		fontSize: pxToRem(13),
	},
	h6: {
		fontWeight: 600,
		lineHeight: 1.4,
		fontSize: pxToRem(12),
	},
	subtitle1: {
		fontWeight: 500,
		lineHeight: 1.4,
		fontSize: pxToRem(14),
	},
	subtitle2: {
		fontWeight: 500,
		lineHeight: 1.4,
		fontSize: pxToRem(13),
	},
	// Metronic: text-[0.8125rem] = 13px as base
	body1: {
		lineHeight: 1.5,
		fontSize: pxToRem(13), // Reduced from 14
	},
	body2: {
		lineHeight: 1.4,
		fontSize: pxToRem(12), // Reduced from 13
	},
	caption: {
		lineHeight: 1.4,
		fontSize: pxToRem(11), // Reduced from 12
	},
	overline: {
		fontWeight: 600,
		lineHeight: 1.4,
		fontSize: pxToRem(10), // Reduced from 11
		letterSpacing: '0.08em',
		textTransform: 'uppercase',
	},
	button: {
		fontWeight: 600,
		lineHeight: 1.5,
		letterSpacing: '0.2px',
		fontSize: pxToRem(13), // Metronic: text-[0.8125rem]
		textTransform: 'unset',
	},
};
