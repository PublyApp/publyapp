// eslint-disable-next-line prettier/prettier
export {};
// import type { PaletteColor, ColorPartial } from '@mui/material';

// declare module '@mui/material' {
// 	// eslint-disable-next-line @typescript-eslint/no-empty-interface
// 	interface PaletteOptions {
// 		// black: string;
// 	}

// 	// eslint-disable-next-line @typescript-eslint/no-empty-interface
// 	interface Palette {
// 		// black: string;
// 	}

// 	interface ButtonOwnProps {
// 		raised?: 0 | 1 | boolean;
// 	}
// }

declare module '@mui/material/styles' {
	interface Theme {
		customShadows: CustomShadowOptions;
	}

	interface ThemeOptions {
		customShadows: CustomShadowOptions;
	}

	interface TypographyVariants {
		h6: TypographyStyle;
		fontWeightSemiBold: React.CSSProperties['fontWeight'];
	}

	interface TypographyVariantsOptions {
		h6: TypographyStyle;
		fontWeightSemiBold: React.CSSProperties['fontWeight'];
	}

	// Custom shadows
	interface CustomShadowOptions {
		z1: string;
		z4: string;
		z8: string;
		z12: string;
		z16: string;
		z20: string;
		z24: string;
		//
		primary: string;
		secondary: string;
		info: string;
		success: string;
		warning: string;
		error: string;
		//
		card: string;
		dialog: string;
		dropdown: string;
	}
}
