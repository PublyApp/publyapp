// core (MUI)
import type { AppLocale } from '@/shared/lib/i18n/resources';
import { frFR as frFRCore } from '@mui/material/locale';
// data grid (MUI)
import {
	enUS as enUSDataGrid,
	frFR as frFRDataGrid,
} from '@mui/x-data-grid/locales';
// date pickers (MUI)
import {
	enUS as enUSDate,
	frFR as frFRDate,
} from '@mui/x-date-pickers/locales';

// ----------------------------------------------------------------------

export const allLangs = [
	{
		value: 'en',
		label: 'English',
		countryCode: 'GB',
		adapterLocale: 'en',
		numberFormat: { code: 'en-US', currency: 'USD' },
		systemValue: {
			components: { ...enUSDate.components, ...enUSDataGrid.components },
		},
	},
	{
		value: 'fr',
		label: 'French',
		countryCode: 'FR',
		adapterLocale: 'fr',
		numberFormat: { code: 'fr-Fr', currency: 'EUR' },
		systemValue: {
			components: {
				...frFRCore.components,
				...frFRDate.components,
				...frFRDataGrid.components,
			},
		},
	},
];

/**
 * Country code:
 * https://flagcdn.com/en/codes.json
 *
 * Number format code:
 * https://gist.github.com/raushankrjha/d1c7e35cf87e69aa8b4208a8171a8416
 */

// ----------------------------------------------------------------------

export const changeLangMessages: Record<
	AppLocale,
	{ success: string; error: string; loading: string }
> = {
	en: {
		success: 'Language has been changed!',
		error: 'Error changing language!',
		loading: 'Loading...',
	},
	fr: {
		success: 'La langue a été changée!',
		error: 'Erreur lors du changement de langue!',
		loading: 'Chargement...',
	},
};
