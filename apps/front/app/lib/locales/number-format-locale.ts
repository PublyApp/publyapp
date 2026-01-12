import i18next from 'i18next';

import { config } from '../i18n/i18n.config';
import { allLangs } from './all-langs';

// ----------------------------------------------------------------------

export const formatNumberLocale = () => {
	const lng = i18next.resolvedLanguage ?? config.fallbackLng;

	const currentLang = allLangs.find((lang) => {
		return lang.value === lng;
	});

	return {
		code: currentLang?.numberFormat.code,
		currency: currentLang?.numberFormat.currency,
	};
};
