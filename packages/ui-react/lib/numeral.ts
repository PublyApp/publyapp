import numeral from 'numeral';

import { appLocales, defaultLocale } from '@/shared/lib/i18n/resources';

import { localStorageGetItem } from '../utils/storage.utils';

import i18n from './i18n';

export const initNumeral = () => {
	numeral.register('locale', appLocales[1], {
		delimiters: {
			thousands: ' ',
			decimal: ',',
		},
		abbreviations: {
			thousand: 'k',
			million: 'm',
			billion: 'b',
			trillion: 't',
		},
		ordinal: (number) => {
			return number === 1 ? 'er' : 'ème';
		},
		currency: {
			symbol: '€',
		},
	});

	const storedLocale = localStorageGetItem('i18nextLng');
	const locale = appLocales.includes(storedLocale as never) ? storedLocale : defaultLocale;

	numeral.locale(locale || defaultLocale);

	i18n.on('languageChanged', (lng) => {
		numeral.locale(lng);
	});
};
