import type {
	ColorSystemOptions,
	PaletteColor,
	PaletteColorChannel,
} from '@mui/material/styles';
import { createPaletteChannel, varAlpha } from 'minimal-shared/utils';

import { themeConfig } from '../theme-config';
import type { ThemeColorScheme } from '../types';

// ----------------------------------------------------------------------

/**
 * TypeScript (type definition and extension)
 * @to {@link file://./../extend-theme-types.d.ts}
 */

// Keys for the palette colors
export type PaletteColorKey =
	| 'primary'
	| 'secondary'
	| 'info'
	| 'success'
	| 'warning'
	| 'error';

// Palette color without additional channels
export type PaletteColorNoChannels = Omit<
	PaletteColor,
	'lighterChannel' | 'darkerChannel'
>;

// Palette color with additional channels
export type PaletteColorWithChannels = PaletteColor & PaletteColorChannel;

// Extended common colors
export type CommonColorsExtend = {
	whiteChannel: string;
	blackChannel: string;
};

// Extended text colors
export type TypeTextExtend = {
	disabledChannel: string;
};

// Extended background colors
export type TypeBackgroundExtend = {
	neutral: string;
	neutralChannel: string;
};

// Extended palette colors
export type PaletteColorExtend = {
	lighter: string;
	darker: string;
	lighterChannel: string;
	darkerChannel: string;
};

// Extended grey channels
export type GreyExtend = {
	'50Channel': string;
	'100Channel': string;
	'200Channel': string;
	'300Channel': string;
	'400Channel': string;
	'500Channel': string;
	'600Channel': string;
	'700Channel': string;
	'800Channel': string;
	'900Channel': string;
};

// ----------------------------------------------------------------------

// Primary color
export const primary = createPaletteChannel(themeConfig.palette.primary);

// Secondary color
export const secondary = createPaletteChannel(themeConfig.palette.secondary);

// Info color
export const info = createPaletteChannel(themeConfig.palette.info);

// Success color
export const success = createPaletteChannel(themeConfig.palette.success);

// Warning color
export const warning = createPaletteChannel(themeConfig.palette.warning);

// Error color
export const error = createPaletteChannel(themeConfig.palette.error);

// Common color
export const common = createPaletteChannel(themeConfig.palette.common);

// Grey color
export const grey = createPaletteChannel(themeConfig.palette.grey);

// Text color - UI Foundations exact values
export const text = {
	light: createPaletteChannel({
		primary: grey[800], // #1F2937
		secondary: grey[600], // #4B5563
		disabled: grey[400], // #9CA3AF
	}),
	dark: createPaletteChannel({
		primary: '#E5E7EB', // gray.800 in dark mode (inverted)
		secondary: '#9CA3AF', // gray.500 in dark mode
		disabled: '#6B7280', // gray.400 in dark mode
	}),
};

// Background color - UI Foundations exact dark mode
// Light: default: 'hsla(210, 20%, 99%, 1)', paper: '#fff'
// Dark: default: 'hsla(220, 2%, 12%, 1)', paper: '#2a2b2e'
export const background = {
	light: createPaletteChannel({
		paper: '#FFFFFF',
		default: '#FCFCFD', // hsla(210, 20%, 99%, 1)
		neutral: grey[100], // #F3F4F6 - also used for hover states
	}),
	dark: createPaletteChannel({
		paper: '#2A2B2E', // UI Foundations exact paper color
		default: '#1E1E1F', // hsla(220, 2%, 12%, 1)
		neutral: '#3A3B3E', // Slightly elevated for cards, also used for hover states
	}),
};

// Base action color
export const baseAction = {
	hover: varAlpha(grey['500Channel'], 0.08),
	selected: varAlpha(grey['500Channel'], 0.16),
	focus: varAlpha(grey['500Channel'], 0.24),
	disabled: varAlpha(grey['500Channel'], 0.8),
	disabledBackground: varAlpha(grey['500Channel'], 0.24),
	hoverOpacity: 0.08,
	disabledOpacity: 0.48,
};

// Action color
export const action = {
	light: { ...baseAction, active: grey[600] },
	dark: { ...baseAction, active: grey[500] },
};

// ----------------------------------------------------------------------

// Base palette
export const basePalette = {
	primary,
	secondary,
	info,
	success,
	warning,
	error,
	common,
	grey,
	divider: varAlpha(grey['500Channel'], 0.2),
};

export const palette: Record<ThemeColorScheme, ColorSystemOptions['palette']> =
	{
		light: {
			...basePalette,
			text: text.light,
			background: background.light,
			action: action.light,
		},
		dark: {
			...basePalette,
			text: text.dark,
			background: background.dark,
			action: action.dark,
		},
	};
