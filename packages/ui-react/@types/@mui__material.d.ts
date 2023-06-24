export {};
// import type { PaletteColor, ColorPartial } from '@mui/material';

declare module '@mui/material' {
	// interface CMInnerPalette {
	// 	violet: Omit<PaletteColor, 'light'>;
	// 	black: string;
	// 	green: string;
	// 	grey: ColorPartial;
	// 	GES: PaletteColor,
	// 	bioDiv: PaletteColor,
	// 	water: PaletteColor,
	// 	welfare: PaletteColor,
	// }

	interface PaletteOptions {
		black: string;
	}

	interface Palette {
		black: string;
	}
}
