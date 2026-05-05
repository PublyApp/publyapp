import type { PaletteColorNoChannels } from '../core';
import { primary, secondary } from '../core/palette';

// ----------------------------------------------------------------------

/**
 * Color presets for social media scheduling SaaS
 * UI Foundations / Tailwind inspired palette
 */
export const primaryColorPresets: Record<string, PaletteColorNoChannels> = {
	// Default: Blue (UI Foundations style)
	default: {
		lighter: primary.lighter,
		light: primary.light,
		main: primary.main,
		dark: primary.dark,
		darker: primary.darker,
		contrastText: primary.contrastText,
	},
	// Indigo: Premium feel
	preset1: {
		lighter: '#E0E7FF',
		light: '#A5B4FC',
		main: '#6366F1',
		dark: '#4338CA',
		darker: '#312E81',
		contrastText: '#FFFFFF',
	},
	// Violet: Creative & bold
	preset2: {
		lighter: '#EDE9FE',
		light: '#C4B5FD',
		main: '#8B5CF6',
		dark: '#6D28D9',
		darker: '#4C1D95',
		contrastText: '#FFFFFF',
	},
	// Sky: Light & trustworthy
	preset3: {
		lighter: '#E0F2FE',
		light: '#7DD3FC',
		main: '#0EA5E9',
		dark: '#0369A1',
		darker: '#0C4A6E',
		contrastText: '#FFFFFF',
	},
	// Rose: Bold & engaging (social media vibe)
	preset4: {
		lighter: '#FFE4E6',
		light: '#FDA4AF',
		main: '#F43F5E',
		dark: '#E11D48',
		darker: '#9F1239',
		contrastText: '#FFFFFF',
	},
	// Emerald: Growth & success
	preset5: {
		lighter: '#D1FAE5',
		light: '#6EE7B7',
		main: '#10B981',
		dark: '#059669',
		darker: '#064E3B',
		contrastText: '#FFFFFF',
	},
	// Claude: Warm & intelligent (Anthropic-inspired)
	preset6: {
		lighter: '#FFDDD2',
		light: '#E8997A',
		main: '#CC785C',
		dark: '#A65940',
		darker: '#6B3A28',
		contrastText: '#FFFFFF',
	},
};

export const secondaryColorPresets: Record<string, PaletteColorNoChannels> = {
	// Default: Cyan (for charts & data viz)
	default: {
		lighter: secondary.lighter,
		light: secondary.light,
		main: secondary.main,
		dark: secondary.dark,
		darker: secondary.darker,
		contrastText: secondary.contrastText,
	},
	// Teal: Balanced & professional
	preset1: {
		lighter: '#CCFBF1',
		light: '#5EEAD4',
		main: '#14B8A6',
		dark: '#0F766E',
		darker: '#134E4A',
		contrastText: '#FFFFFF',
	},
	// Amber: Warm accent
	preset2: {
		lighter: '#FEF3C7',
		light: '#FCD34D',
		main: '#F59E0B',
		dark: '#D97706',
		darker: '#92400E',
		contrastText: '#18181B',
	},
	// Orange: Energetic
	preset3: {
		lighter: '#FFEDD5',
		light: '#FDBA74',
		main: '#F97316',
		dark: '#C2410C',
		darker: '#7C2D12',
		contrastText: '#FFFFFF',
	},
	// Pink: Creative
	preset4: {
		lighter: '#FCE7F3',
		light: '#F9A8D4',
		main: '#EC4899',
		dark: '#BE185D',
		darker: '#831843',
		contrastText: '#FFFFFF',
	},
	// Lime: Fresh & dynamic
	preset5: {
		lighter: '#ECFCCB',
		light: '#BEF264',
		main: '#84CC16',
		dark: '#4D7C0F',
		darker: '#365314',
		contrastText: '#0F172A',
	},
	// Warm Brown: Earthy & sophisticated (Claude secondary)
	preset6: {
		lighter: '#E7D4C5',
		light: '#B8947A',
		main: '#8B6F47',
		dark: '#6B5235',
		darker: '#4A3722',
		contrastText: '#FFFFFF',
	},
};
