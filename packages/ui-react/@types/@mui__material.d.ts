export {};
// import type { PaletteColor, ColorPartial } from '@mui/material';

declare module '@mui/material' {
	// eslint-disable-next-line @typescript-eslint/no-empty-interface
	interface PaletteOptions {
		// black: string;
	}

	// eslint-disable-next-line @typescript-eslint/no-empty-interface
	interface Palette {
		// black: string;
	}

	interface ButtonOwnProps {
		raised?: boolean;
	}
}
