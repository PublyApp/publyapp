import numeral from 'numeral';

import { appLocales, defaultLocale } from '@/shared/lib/i18n/resources';

import { getInitialLocale } from './i18n';

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

	const locale = getInitialLocale();

	numeral.locale(locale || defaultLocale);
};
