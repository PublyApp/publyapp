import { /* useCallback, */ useEffect } from 'react';

import { useTranslation } from 'react-i18next';
import { useLocalStorage } from 'react-use';

// utils
// import { localStorageGetItem } from 'src/utils/storage-available';

//
// import { allLangs, defaultLang } from './config-lang';
import { /* appLocales, defaultLocale, */ type AppLocale } from '@devist/shared/i18n/resources';
import { LOCALE_HEADER_KEY } from '@devist/shared/utils/constants';

// ----------------------------------------------------------------------

const useLocale = () => {
	const { i18n /* , t */ } = useTranslation();

	// const settings = useSettingsContext();

	// const langStorage = localStorageGetItem('i18nextLng');
	const [locale, setLocale] = useLocalStorage<AppLocale>('i18nextLng', undefined, { raw: true });

	// const currentLocale =
	// 	appLocales.find((lang) => {
	// 		// return lang.value === langStorage;
	// 		return lang === storedLocale;
	// 	}) || defaultLocale;

	// const changeLang = useCallback(
	// 	(newLang: string) => {
	// 		i18n.changeLanguage(newLang);
	// 		// settings.onChangeDirectionByLang(newLang);
	// 	},
	// 	[i18n /* , settings */],
	// );
	// const changeLocale = useCallback((newLocale: AppLocale) => {});

	useEffect(() => {
		Parse.CoreManager.set('REQUEST_HEADERS', {
			[LOCALE_HEADER_KEY]: locale,
		});
		i18n.changeLanguage(locale);
		// queryClient.invalidateQueries();
	}, [locale]);

	return {
		locale,
		setLocale,
	};
};

export default useLocale;
