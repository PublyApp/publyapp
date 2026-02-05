import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { AppLocale } from '@/shared/lib/i18n/resources';
import { logger } from '@/shared/lib/logger/iso-logger';
import { getErrorMessage } from '@/shared/utils/error.utils';

import { toast } from '../components/snackbar';
import { config } from '../lib/i18n/i18n.config';
import { allLangs, changeLangMessages } from '../lib/locales/all-langs';

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
				const langChangePromise = i18n.changeLanguage(newLang);

				const currentMessages =
					changeLangMessages[newLang] || changeLangMessages.en;

				toast.promise(langChangePromise, {
					loading: currentMessages.loading,
					success: () => {
						return currentMessages.success;
					},
					error: currentMessages.error,
				});

				// * already handled in initI18n.client.ts
				// if (currentLang) {
				// 	dayjs.locale(currentLang.adapterLocale);
				// }
			} catch (error) {
				logger.error(getErrorMessage(error), { error });
			}
		},
		[/* currentLang, */ i18n],
	);

	const lang = currentLang ?? fallback;

	return {
		t,
		i18n,
		onChangeLang,
		currentLang: lang,
	};
};
