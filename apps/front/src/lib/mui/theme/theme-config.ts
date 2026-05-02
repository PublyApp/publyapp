import type { CommonColors } from '@mui/material/styles';

import type { PaletteColorNoChannels } from './core/palette';
import type {
	ThemeColorScheme,
	ThemeCssVariables,
	ThemeDirection,
} from './types';

// ----------------------------------------------------------------------

type ThemeConfig = {
	classesPrefix: string;
	modeStorageKey: string;
	enableSystemMode: boolean;
	direction: ThemeDirection;
	defaultMode: ThemeColorScheme;
	cssVariables: ThemeCssVariables;
	fontFamily: Record<'primary' | 'secondary', string>;
	palette: Record<
		'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'error',
		PaletteColorNoChannels
	> & {
		common: Pick<CommonColors, 'black' | 'white'>;
		grey: Record<
			| '50'
			| '100'
			| '200'
			| '300'
			| '400'
			| '500'
			| '600'
			| '700'
			| '800'
			| '900',
			string
		>;
	};
};

export const themeConfig: ThemeConfig = {
	/** **************************************
	 * Base
	 *************************************** */
	defaultMode: 'light', // Match publyapp-5 while theme sync work is pending merge
	enableSystemMode: false,
	modeStorageKey: 'theme-mode',
	direction: 'ltr',
	classesPrefix: 'publy', // Rebrand prefix
	/** **************************************
	 * Typography
	 * UI Foundations uses Inter
	 *************************************** */
	fontFamily: {
		primary: 'Inter Variable',
		secondary: 'Inter Variable',
	},
	/** **************************************
	 * Palette
	 * Exact UI Foundations color tokens (HSL-based)
	 *************************************** */
	palette: {
		// UI Foundations Primary Blue Scale
		primary: {
			lighter: '#DBEAFE', // hsl(214, 95%, 93%)
			light: '#60A5FA', // hsl(213, 94%, 68%)
			main: '#2563EB', // hsl(221, 84%, 54%) - UI Foundations main
			dark: '#1D4ED8', // hsl(224, 76%, 48%)
			darker: '#1E3A8A', // hsl(226, 65%, 34%)
			contrastText: '#FFFFFF',
		},
		// UI Foundations Cyan/Blue for data viz
		secondary: {
			lighter: '#CFFAFE', // hsl(204, 100%, 97%)
			light: '#67E8F9', // hsl(199, 95%, 74%)
			main: '#0891B2', // hsl(200, 98%, 39%)
			dark: '#0E7490', // hsl(201, 96%, 32%)
			darker: '#164E63', // hsl(202, 80%, 24%)
			contrastText: '#FFFFFF',
		},
		// UI Foundations Blue for info
		info: {
			lighter: '#E0F2FE', // hsl(204, 94%, 94%)
			light: '#38BDF8', // hsl(198, 93%, 60%)
			main: '#0EA5E9', // hsl(199, 89%, 48%)
			dark: '#0284C7', // hsl(200, 98%, 39%)
			darker: '#075985', // hsl(201, 90%, 27%)
			contrastText: '#FFFFFF',
		},
		// UI Foundations Green Scale
		success: {
			lighter: '#D1FAE5', // hsl(152, 81%, 96%)
			light: '#6EE7B7', // hsl(156, 72%, 67%)
			main: '#059669', // hsl(161, 94%, 30%)
			dark: '#047857', // hsl(163, 94%, 24%)
			darker: '#064E3B', // hsl(164, 86%, 16%)
			contrastText: '#FFFFFF',
		},
		// UI Foundations Yellow/Warning Scale
		warning: {
			lighter: '#FEF9C3', // hsl(55, 92%, 95%)
			light: '#FDE047', // hsl(50, 98%, 64%)
			main: '#CA8A04', // hsl(41, 96%, 40%)
			dark: '#A16207', // hsl(35, 92%, 33%)
			darker: '#713F12', // hsl(28, 73%, 26%)
			contrastText: '#1F2937',
		},
		// UI Foundations Red Scale
		error: {
			lighter: '#FEE2E2', // hsl(0, 86%, 97%)
			light: '#FCA5A5', // hsl(0, 91%, 71%)
			main: '#DC2626', // hsl(0, 72%, 51%)
			dark: '#B91C1C', // hsl(0, 74%, 42%)
			darker: '#7F1D1D', // hsl(0, 63%, 31%)
			contrastText: '#FFFFFF',
		},
		// UI Foundations Exact Gray Scale (HSL-based cool gray)
		grey: {
			'50': '#FAFBFC', // hsl(210, 20%, 98%)
			'100': '#F3F4F6', // hsl(218, 14%, 96%)
			'200': '#E5E7EB', // hsl(218, 13%, 90%)
			'300': '#D1D5DB', // hsl(217, 12%, 84%)
			'400': '#9CA3AF', // hsl(218, 11%, 65%)
			'500': '#6B7280', // hsl(220, 10%, 46%)
			'600': '#4B5563', // hsl(216, 14%, 34%)
			'700': '#374151', // hsl(217, 18%, 26%)
			'800': '#1F2937', // hsl(215, 27%, 17%)
			'900': '#111827', // hsl(218, 39%, 10%)
		},
		common: { black: '#111827', white: '#FAFBFC' },
	},
	/** **************************************
	 * Css variables
	 *************************************** */
	cssVariables: {
		cssVarPrefix: '',
		colorSchemeSelector: 'data-color-scheme',
	},
};
