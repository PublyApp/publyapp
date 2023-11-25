export {};

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

// NEW VARIANT
declare module '@mui/material/Button' {
	interface ButtonPropsVariantOverrides {
		soft: true;
	}
}

declare module '@mui/material/styles/createPalette' {
	interface TypeBackground {
		neutral: string;
	}

	interface TypeBackgroundOptions {
		neutral: string;
	}

	interface TypeBackground {
		neutral: string;
	}
	interface SimplePaletteColorOptions {
		lighter: string;
		darker: string;
	}
	interface PaletteColor {
		lighter: string;
		darker: string;
	}
}
