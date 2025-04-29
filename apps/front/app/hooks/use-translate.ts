import { useCallback } from 'react';

// import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';

import type { AppLocale } from '@/shared/lib/i18n/resources';

import { config } from '../lib/i18n/i18n.config';
import { allLangs } from '../lib/locales/all-langs';

// ----------------------------------------------------------------------

type Ns = Parameters<typeof useTranslation>[0];

export const useTranslate = (ns?: Ns) => {
	const { t, i18n } = useTranslation(ns);

	const fallback = allLangs.filter((lang) => {
		return lang.value === config.fallbackLng;
	})[0];

	const currentLang = allLangs.find((lang) => {
		return lang.value === i18n.resolvedLanguage;
	});

	const onChangeLang = useCallback(
		async (newLang: AppLocale) => {
			try {
				i18n.changeLanguage(newLang);
				// const langChangePromise = i18n.changeLanguage(newLang);

				// const currentMessages = messages[newLang] || messages.en;

				// toast.promise(langChangePromise, {
				// 	loading: currentMessages.loading,
				// 	success: () => {
				// 		return currentMessages.success;
				// 	},
				// 	error: currentMessages.error,
				// });

				// * already handled in initI18n.client.ts
				// if (currentLang) {
				// 	dayjs.locale(currentLang.adapterLocale);
				// }
			} catch (error) {
				console.error(error);
			}
		},
		[/* currentLang, */ i18n],
	);

	return {
		t,
		i18n,
		onChangeLang,
		currentLang: currentLang ?? fallback,
	};
};
