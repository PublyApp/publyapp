import { useCallback, type Dispatch, type SetStateAction } from 'react';

import _ from 'lodash';
import { useTranslation } from 'react-i18next';

import { LOCALE_HEADER_KEY } from '@devist/shared/lib/constants';
import { appLocales, defaultLocale, type AppLocale } from '@devist/shared/lib/i18n/resources';

// import i18n from '@/ui-react/utils/i18n';
import { localStorageGetItem } from '@/ui-react/utils/storage.utils';

import { defaultLangConfig, langConfigsMap } from '../config/lang.config';

// ----------------------------------------------------------------------

const useLocale = () => {
	const { i18n /* t, ready */ } = useTranslation();

	const storedLocale = localStorageGetItem('i18nextLng');
	const locale =
		appLocales.find((iLocale) => {
			return iLocale === storedLocale;
		}) || defaultLocale;

	const lang = langConfigsMap.get(locale) || defaultLangConfig;

	const changeLocale = useCallback(
		(value: AppLocale) => {
			i18n.changeLanguage(value);
			Parse.CoreManager.set('REQUEST_HEADERS', {
				[LOCALE_HEADER_KEY]: value,
			});
		},
		[i18n],
	);

	const setLocale: Dispatch<SetStateAction<AppLocale>> = useCallback(
		(value) => {
			if (_.isFunction(value)) {
				const updater = value;
				const iValue = updater(locale);
				changeLocale(iValue);
				return;
			}

			changeLocale(value);
		},
		[changeLocale, locale],
	);

	return {
		// locale,
		lang,
		setLocale,
		// i18n,
		// t,
		// ready,
	};
};

export default useLocale;
