import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';

import { useLocation } from '@remix-run/react';
import _ from 'lodash';
import numeral from 'numeral';
import { useTranslation } from 'react-i18next';

import parseApi from '@devist/api/parse/ParseApi';
import { LOCALE_HEADER_KEY } from '@devist/shared/lib/constants';
import { appLocales, defaultLocale, type AppLocale } from '@devist/shared/lib/i18n/resources';

import { defaultLangConfig, langConfigsMap } from '@/ui-react/config/lang.config';
import { defaultZodClient } from '@/ui-react/lib/zod';

// ----------------------------------------------------------------------

const useTranslate = () => {
	const { i18n, t, ready } = useTranslation();
	const { pathname } = useLocation();

	const allLangs = useMemo(() => {
		return Array.from(langConfigsMap.values());
	}, []);

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

	const changeLocale = useCallback(
		(value: AppLocale) => {
			i18n.changeLanguage(value);

			// set locale header for parse-server
			// const reqHeaders = Parse.CoreManager.get('REQUEST_HEADERS');
			// Parse.CoreManager.set('REQUEST_HEADERS', _.assign(reqHeaders, { [LOCALE_HEADER_KEY]: value }));
			parseApi.parseRestClient.setHeader(LOCALE_HEADER_KEY, value);

			// se locale of numeral.js (number formatting)
			numeral.locale(value);

			// set locale for our CustomZod instance
			defaultZodClient.setLocale(value);
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

	useEffect(() => {
		const handler = (/* , e: PopStateEvent */) => {
			const pathLocale =
				appLocales.find((iLocale) => {
					return window.location.pathname.startsWith(`/${iLocale}`);
				}) || defaultLocale;

			if (pathLocale !== locale) {
				setLocale(pathLocale);
			}
		};

		window.addEventListener('popstate', handler);

		return () => {
			window.removeEventListener('popstate', handler);
		};
	}, [locale, pathname, setLocale]);

	return {
		locale,
		lang,
		setLocale,
		i18n,
		t,
		ready,
		allLangs,
	};
};

export default useTranslate;
