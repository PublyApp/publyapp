import type { TypographyOptions } from '@mui/material/styles/createTypography';

import { getResponsiveFontSizes, pxToRem } from '@ui-react/utils/css.utils';

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
	// color: palette.grey?.[800],
};

export const typography: TypographyOptions = {
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
