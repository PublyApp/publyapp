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

	// eslint-disable-next-line @typescript-eslint/no-empty-interface
	interface PaletteOptions {
		// black: string;
	}

	// eslint-disable-next-line @typescript-eslint/no-empty-interface
	interface Palette {
		// black: string;
	}
}
