import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';

import _ from 'lodash';
import { useTranslation } from 'react-i18next';

import { LOCALE_HEADER_KEY } from '@devist/shared/lib/constants';
import { appLocales, defaultLocale, type AppLocale } from '@devist/shared/lib/i18n/resources';

import { defaultLangConfig, langConfigsMap } from '../config/lang.config';

// ----------------------------------------------------------------------

const useLocale = () => {
	const { i18n, t, ready } = useTranslation();

	const { locale, lang } = useMemo(() => {
		// eslint-disable-next-line @typescript-eslint/naming-convention
		let _locale = i18n.language as AppLocale;
		_locale = appLocales.includes(_locale) ? _locale : defaultLocale;

		// eslint-disable-next-line @typescript-eslint/naming-convention
		const _lang = langConfigsMap.get(_locale as AppLocale) || defaultLangConfig;

		return {
			locale: _locale,
			lang: _lang,
		};
	}, [i18n.language]);

	// for forcing re-renders
	const [, setLocaleState] = useState<AppLocale>(locale);

	const changeLocale = useCallback(
		(value: AppLocale) => {
			i18n.changeLanguage(value);
			Parse.CoreManager.set('REQUEST_HEADERS', {
				[LOCALE_HEADER_KEY]: value,
			});
			setLocaleState(value);
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
		locale,
		lang,
		setLocale,
		i18n,
		t,
		ready,
	};
};

export default useLocale;
